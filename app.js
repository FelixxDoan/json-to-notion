const express = require('express');
const multer = require('multer');
const { Client } = require('@notionhq/client');
const path = require('path');
const cors = require('cors');

const { propertyBuilder } = require('./helpers/propertyBuilder');
const { buildContentBlocks } = require('./helpers/blockBuilder');
const { generateIcon } = require('./helpers/iconGenerator');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
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

async function resolveParentTarget(notion, databaseId, dataSourceId) {
  if (dataSourceId) {
    return { data_source_id: cleanDbId(dataSourceId) };
  }

  const dbInfo = await notion.databases.retrieve({
    database_id: cleanDbId(databaseId)
  });

  if (dbInfo?.data_sources?.length) {
    return { data_source_id: dbInfo.data_sources[0].id };
  }

  return { database_id: cleanDbId(databaseId) };
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

    let finalProperties = {};
    if (dbInfo?.properties) {
      finalProperties = { ...dbInfo.properties };
    }

    let dataSourceId = null;
    if (dbInfo?.data_sources?.length) {
      dataSourceId = dbInfo.data_sources[0].id;
      const dsInfo = await notion.dataSources.retrieve({
        data_source_id: dataSourceId
      });
      if (dsInfo?.properties) {
        finalProperties = { ...finalProperties, ...dsInfo.properties };
      }
    }

    if (Object.keys(finalProperties).length === 0) {
      return res.status(400).json({
        error: 'Could not read any database properties.'
      });
    }

    const properties = Object.entries(finalProperties).map(([key, value]) => ({
      name: key,
      type: value?.type || 'unknown',
      id: value?.id || null
    }));

    console.log('--- DEBUG PROPERTIES ---');
    console.log('dbInfo.properties:', dbInfo.properties ? Object.keys(dbInfo.properties) : 'none');
    console.log('finalProperties keys:', Object.keys(finalProperties));
    
    return res.json({
      database: {
        id: dbInfo.id,
        title: dbInfo.title || [],
        dataSourceId
      },
      properties
    });
  } catch (error) {
    console.error('Schema load failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/sync', upload.single('jsonFile'), async (req, res) => {
  try {
    const { notionToken, databaseId, dataSourceId, mapping } = req.body;
    const cleanedDbId = cleanDbId(databaseId);
    const notion = new Client({ auth: notionToken });

    let mappingData;
    try {
      mappingData = JSON.parse(mapping);
    } catch {
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
    } catch {
      return res.status(400).json({ error: 'Invalid JSON format in file' });
    }

    const parent = await resolveParentTarget(notion, cleanedDbId, dataSourceId);

    const jobId = Date.now().toString();
    jobs[jobId] = {
      status: 'running',
      total: jsonDataList.length,
      current: 0,
      successCount: 0,
      errors: []
    };

    res.json({ jobId, message: 'Sync started' });

    processSync(jobId, jsonDataList, mappingData, notionToken, parent).catch((error) => {
      console.error('Sync process failed:', error);
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
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
      if (job.status === 'completed' || job.status === 'completed_with_errors' || job.status === 'failed') {
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

async function processSync(jobId, dataList, mappingData, token, parent) {
  const notion = new Client({ auth: token });
  const job = jobs[jobId];
  const { propertyMappings = [], contentMappings = [] } = mappingData;

  try {
    for (let i = 0; i < dataList.length; i += 1) {
      const item = dataList[i];

      let titleText = '';
      const properties = {};
      for (const map of propertyMappings) {
        const val = item[map.jsonKey];
        const prop = propertyBuilder(map.type, val);
        if (prop !== undefined) {
          properties[map.notionCol] = prop;
        }
        if (map.type === 'title' && val !== undefined && val !== null && val !== '') {
          titleText = String(val);
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
          parent,
          properties,
          ...(children.length > 0 && { children }),
          ...(icon && { icon }),
          ...(cover && { cover })
        });
        job.current = i + 1;
        job.successCount += 1;
      } catch (error) {
        job.errors.push(`Row ${i + 1} Error: ${error.message}`);
        job.current = i + 1;
      }

      await new Promise((resolve) => setTimeout(resolve, 340));
    }
    if (job.errors.length === 0) {
      job.status = 'completed';
    } else if (job.successCount > 0) {
      job.status = 'completed_with_errors';
    } else {
      job.status = 'failed';
    }
  } catch (error) {
    job.status = 'failed';
    job.errors.push(`Fatal error: ${error.message}`);
  }
}

module.exports = app;
