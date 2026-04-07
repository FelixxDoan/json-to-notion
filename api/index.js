const express = require('express');
const multer = require('multer');
const { Client } = require('@notionhq/client');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const { propertyBuilder } = require('../helpers/propertyBuilder');
const { buildContentBlocks } = require('../helpers/blockBuilder');
const { generateIcon } = require('../helpers/iconGenerator');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

const jobs = {};

function cleanDbId(id) {
    let cleaned = id.trim();
    if (cleaned.includes('/')) {
        const parts = cleaned.split('/');
        cleaned = parts[parts.length - 1];
    }
    if (cleaned.includes('?')) {
        cleaned = cleaned.split('?')[0];
    }
    return cleaned;
}

app.post('/api/schema', async (req, res) => {
  try {
    const { notionToken, databaseId } = req.body;
    if (!notionToken || !databaseId) {
      return res.status(400).json({ error: 'Missing notionToken or databaseId' });
    }

    const dbId = cleanDbId(databaseId);
    const notion = new Client({ auth: notionToken });

    const dbInfo = await notion.databases.retrieve({ database_id: dbId });

    if (!dbInfo?.data_sources?.length) {
      return res.status(400).json({
        error: 'Database has no accessible data sources.'
      });
    }

    const dataSourceId = dbInfo.data_sources[0].id;
    const dsInfo = await notion.dataSources.retrieve({
      data_source_id: dataSourceId
    });

    if (!dsInfo?.properties || typeof dsInfo.properties !== 'object') {
      return res.status(400).json({
        error: 'Could not read data source properties.'
      });
    }

    const properties = Object.entries(dsInfo.properties).map(([key, value]) => ({
      name: key,
      type: value?.type || 'unknown',
      id: value?.id || null
    }));

    res.json({
      database: {
        id: dbInfo.id,
        title: dbInfo.title || [],
        dataSourceId
      },
      properties
    });
  } catch (error) {
    console.error('Schema load failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sync', upload.single('jsonFile'), async (req, res) => {
  try {
    const { notionToken, databaseId, mapping } = req.body;
    const cleanedDbId = cleanDbId(databaseId);
    
    let mappingData;
    try {
        mappingData = JSON.parse(mapping);
    } catch (e) {
        mappingData = { propertyMappings: [], contentMappings: [] };
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No JSON file uploaded' });
    }

    const fileContent = req.file.buffer.toString('utf8');
    let jsonDataList;
    try {
      jsonDataList = JSON.parse(fileContent);
      if (!Array.isArray(jsonDataList)) {
        jsonDataList = [jsonDataList];
      }
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON format in file' });
    }

    const jobId = Date.now().toString();
    jobs[jobId] = {
      status: 'running',
      total: jsonDataList.length,
      current: 0,
      errors: []
    };

    res.json({ jobId, message: 'Sync started' });

    processSync(jobId, jsonDataList, mappingData, notionToken, cleanedDbId).catch(console.error);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  let isOpen = true;

  const timer = setInterval(() => {
    if (!isOpen) return;
    const job = jobs[jobId];
    if (job) {
      res.write(`data: ${JSON.stringify(job)}\n\n`);
      if (job.status === 'completed' || job.status === 'failed') {
        clearInterval(timer);
        res.end();
      }
    } else {
      res.write(`data: ${JSON.stringify({ status: 'not_found' })}\n\n`);
      clearInterval(timer);
      res.end();
    }
  }, 500);

  req.on('close', () => {
    isOpen = false;
    clearInterval(timer);
  });
});

async function processSync(jobId, dataList, mappingData, token, dbId) {
  const notion = new Client({ auth: token });
  const job = jobs[jobId];
  const { propertyMappings = [], contentMappings = [] } = mappingData;
  
  try {
    for (let i = 0; i < dataList.length; i++) {
        const item = dataList[i];
        
        let titleText = '';
        let properties = {};
        for (const map of propertyMappings) {
            const val = item[map.jsonKey];
            if (val !== undefined && val !== null && val !== '') {
                const prop = propertyBuilder(map.type, val);
                if (prop) {
                   properties[map.notionCol] = prop;
                }
                if (map.type === 'title') {
                    titleText = String(val);
                }
            }
        }
        
        let children = [];
        for (const map of contentMappings) {
             const val = item[map.jsonKey];
             if (val !== undefined && val !== null && val !== '') {
                 const newBlocks = buildContentBlocks(val, map.jsonKey);
                 children = children.concat(newBlocks);
             }
        }
        
        let icon;
        if (item.icon) {
            if (item.icon.startsWith('http')) {
                icon = { type: 'external', external: { url: item.icon } };
            } else {
                icon = { type: 'emoji', emoji: item.icon };
            }
        } else {
            icon = generateIcon(titleText);
        }
        
        let cover;
        if (item.cover && item.cover.startsWith('http')) {
            cover = { type: 'external', external: { url: item.cover } };
        }

        try {
            await notion.pages.create({
                parent: { database_id: dbId },
                properties: properties,
                ...(children.length > 0 && { children }),
                ...(icon && { icon }),
                ...(cover && { cover })
            });
            job.current = i + 1;
        } catch (err) {
            job.errors.push(`Row ${i + 1} Error: ${err.message}`);
            job.current = i + 1; 
        }
        
        await new Promise(r => setTimeout(r, 340));
    }
    job.status = 'completed';
  } catch (err) {
    job.status = 'failed';
    job.errors.push(`Fatal error: ${err.message}`);
  }
}

module.exports = app;
