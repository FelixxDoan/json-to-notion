document.addEventListener('DOMContentLoaded', () => {
    const connectForm = document.getElementById('connectForm');
    const connectBtn = document.getElementById('connectBtn');
    const syncForm = document.getElementById('syncForm');
    
    const fileInput = document.getElementById('jsonFile');
    const fileNameDisplay = document.getElementById('fileName');
    
    const addPropRowBtn = document.getElementById('addPropRowBtn');
    const propertyMappingContainer = document.getElementById('propertyMappingContainer');
    
    const addContentRowBtn = document.getElementById('addContentRowBtn');
    const contentMappingContainer = document.getElementById('contentMappingContainer');
    
    const submitBtn = document.getElementById('submitBtn');
    const statusContainer = document.getElementById('statusContainer');
    const statusText = document.getElementById('statusText');
    const statusCount = document.getElementById('statusCount');
    const progressBar = document.getElementById('progressBar');
    const logContainer = document.getElementById('logContainer');
    
    const notionTokenEl = document.getElementById('notionToken');
    const databaseIdEl = document.getElementById('databaseId');
    const clearStorageBtn = document.getElementById('clearStorageBtn');

    // Load from localStorage
    if (localStorage.getItem('notionToken') || localStorage.getItem('databaseId')) {
        notionTokenEl.value = localStorage.getItem('notionToken') || '';
        databaseIdEl.value = localStorage.getItem('databaseId') || '';
        if (clearStorageBtn) clearStorageBtn.classList.remove('hidden');
    }

    // Save inputs automatically on change
    notionTokenEl.addEventListener('input', (e) => {
        localStorage.setItem('notionToken', e.target.value.trim());
        if (clearStorageBtn) clearStorageBtn.classList.remove('hidden');
    });
    databaseIdEl.addEventListener('input', (e) => {
        localStorage.setItem('databaseId', e.target.value.trim());
        if (clearStorageBtn) clearStorageBtn.classList.remove('hidden');
    });

    if (clearStorageBtn) {
        clearStorageBtn.addEventListener('click', () => {
            localStorage.removeItem('notionToken');
            localStorage.removeItem('databaseId');
            notionTokenEl.value = '';
            databaseIdEl.value = '';
            clearStorageBtn.classList.add('hidden');
        });
    }

    let schemaProperties = [];
    let currentDataSourceId = null;

    function appendLog(message, isError = false) {
        const div = document.createElement('div');
        div.textContent = `> ${message}`;
        div.className = isError ? 'text-red-400' : 'text-green-400';
        logContainer.appendChild(div);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // Connect & Fetch Schema
    connectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const notionToken = notionTokenEl.value.trim();
        const databaseId = databaseIdEl.value.trim();

        if (!notionToken || !databaseId) return;

        // Auto save on submit 
        localStorage.setItem('notionToken', notionToken);
        localStorage.setItem('databaseId', databaseId);
        if (clearStorageBtn) clearStorageBtn.classList.remove('hidden');

        connectBtn.disabled = true;
        connectBtn.innerHTML = 'Fetching Schema...';

        try {
            const res = await fetch('/api/schema', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notionToken, databaseId })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch schema');

            schemaProperties = data.properties;
            currentDataSourceId = data.database?.dataSourceId || null;

            // Show sync form
            syncForm.classList.remove('hidden');
            connectBtn.innerHTML = 'Connected ✓';
            connectBtn.classList.remove('from-indigo-400', 'to-cyan-400');
            connectBtn.classList.add('bg-green-600');
            
            // Re-render properties if already added
            propertyMappingContainer.innerHTML = '';
            contentMappingContainer.innerHTML = '';
            
            // Add a default row for title implicitly
            const titleProp = schemaProperties.find(p => p.type === 'title');
            if (titleProp) {
                addPropertyRow(titleProp.name);
            }

        } catch (error) {
            alert(`Schema Error: ${error.message}`);
            connectBtn.disabled = false;
            connectBtn.innerHTML = 'Connect & Fetch Schema';
        }
    });

    // Handle File Display
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            fileNameDisplay.textContent = `Selected: ${file.name}`;
            fileNameDisplay.classList.remove('hidden');
            
            autoMapFile(file);
        } else {
            fileNameDisplay.classList.add('hidden');
            propertyMappingContainer.innerHTML = '';
            contentMappingContainer.innerHTML = '';
            const titleProp = schemaProperties.find(p => p.type === 'title');
            if (titleProp) {
                addPropertyRow(titleProp.name);
            }
        }
    });

    function autoMapFile(file) {
        if (!file || schemaProperties.length === 0) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                let data = JSON.parse(e.target.result);
                if (!Array.isArray(data)) {
                    data = [data];
                }
                
                const allKeys = new Set();
                data.forEach(item => {
                    if (item && typeof item === 'object') {
                        Object.keys(item).forEach(k => allKeys.add(k));
                    }
                });

                propertyMappingContainer.innerHTML = '';
                contentMappingContainer.innerHTML = '';

                let titleMapped = false;

                allKeys.forEach(key => {
                    const matchedProp = schemaProperties.find(p => p.name === key);
                    
                    if (matchedProp) {
                        addPropertyRow(matchedProp.name, key);
                        if (matchedProp.type === 'title') titleMapped = true;
                    } else if (key !== 'icon' && key !== 'cover') {
                        addContentRow(key);
                    }
                });
                
                // If the Title prop didn't map automatically, ensure we show it
                if (!titleMapped) {
                    const titleProp = schemaProperties.find(p => p.type === 'title');
                    if (titleProp) {
                        addPropertyRow(titleProp.name);
                    }
                }
                
            } catch (err) {
                console.error("Error auto-mapping JSON:", err);
            }
        };
        reader.readAsText(file);
    }

    function addPropertyRow(defaultNotionCol = '', defaultJsonKey = '') {
        if (schemaProperties.length === 0) return;

        const template = document.getElementById('propertyRowTemplate');
        const clone = template.content.cloneNode(true);
        const row = clone.querySelector('div');
        const select = clone.querySelector('.notion-col');
        
        // Populate options
        schemaProperties.forEach(prop => {
            const option = document.createElement('option');
            option.value = `${prop.name}|${prop.type}`;
            option.textContent = `${prop.name} (${prop.type})`;
            if (prop.name === defaultNotionCol) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        if (defaultJsonKey) {
            clone.querySelector('.json-key').value = defaultJsonKey;
        }

        const removeBtn = clone.querySelector('.remove-row-btn');
        removeBtn.addEventListener('click', () => {
            row.remove();
        });

        propertyMappingContainer.appendChild(clone);
    }

    function addContentRow(defaultJsonKey = '') {
        const template = document.getElementById('contentRowTemplate');
        const clone = template.content.cloneNode(true);
        const row = clone.querySelector('div');

        if (defaultJsonKey) {
            clone.querySelector('.json-key').value = defaultJsonKey;
        }

        const removeBtn = clone.querySelector('.remove-row-btn');
        removeBtn.addEventListener('click', () => {
            row.remove();
        });

        contentMappingContainer.appendChild(clone);
    }

    addPropRowBtn.addEventListener('click', () => addPropertyRow());
    addContentRowBtn.addEventListener('click', () => addContentRow());

    syncForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Build mapping
        const propRows = document.querySelectorAll('#propertyMappingContainer > div');
        const contentRows = document.querySelectorAll('#contentMappingContainer > div');
        
        const propertyMappings = [];
        const contentMappings = [];
        
        let hasTitle = false;
        
        propRows.forEach(row => {
            const selectVal = row.querySelector('.notion-col').value;
            const jsonKey = row.querySelector('.json-key').value.trim();
            
            if (selectVal && jsonKey) {
                const [notionCol, propType] = selectVal.split('|');
                if (propType === 'title') hasTitle = true;
                propertyMappings.push({ notionCol, type: propType, jsonKey });
            }
        });

        contentRows.forEach(row => {
            const jsonKey = row.querySelector('.json-key').value.trim();
            if (jsonKey) {
                contentMappings.push({ jsonKey });
            }
        });

        const mapping = { propertyMappings, contentMappings };

        if (!hasTitle) {
             const proceed = confirm("Warning: You have not mapped a 'title' property. Notion pages usually require at least one 'title' property to display correctly. Proceed anyway?");
             if (!proceed) return;
        }

        const notionToken = document.getElementById('notionToken').value.trim();
        const databaseId = document.getElementById('databaseId').value.trim();
        const file = fileInput.files[0];

        if (!file) {
            alert("Please upload a JSON file.");
            return;
        }

        // Prepare Form Data
        const formData = new FormData();
        formData.append('notionToken', notionToken);
        formData.append('databaseId', databaseId);
        if (currentDataSourceId) {
            formData.append('dataSourceId', currentDataSourceId);
        }
        formData.append('jsonFile', file);
        formData.append('mapping', JSON.stringify(mapping));

        // Update UI for Sync Mode
        submitBtn.disabled = true;
        submitBtn.innerHTML = `Syncing...`;
        submitBtn.classList.add('opacity-75');
        
        syncForm.classList.add('syncing-glow');
        statusContainer.classList.remove('hidden');
        logContainer.innerHTML = '';
        progressBar.style.width = '0%';
        appendLog('Starting sync initialization...');

        try {
            const res = await fetch('/api/sync', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Server rejected the request');
            }

            appendLog(`Job initialized! Job ID: ${data.jobId}`);
            
            // Connect SSE
            const eventSource = new EventSource(`/api/status/${data.jobId}`);
            
            eventSource.onmessage = (event) => {
                const jobData = JSON.parse(event.data);
                
                if (jobData.status === 'not_found') {
                    appendLog('Job not found on server.', true);
                    eventSource.close();
                    resetUI();
                    return;
                }

                // Update Progress
                const { status, total, current, errors, successCount = 0 } = jobData;
                const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
                
                progressBar.style.width = `${percentage}%`;
                statusCount.textContent = `${percentage}%`;
                statusText.textContent = `Syncing: ${current} / ${total} rows processed`;
                submitBtn.innerHTML = `Syncing... ${current}/${total}`;

                // Append any new logs
                const currentErrorCount = window._lastErrorCount || 0;
                if (errors.length > currentErrorCount) {
                    for(let i = currentErrorCount; i < errors.length; i++) {
                        appendLog(errors[i], true);
                    }
                    window._lastErrorCount = errors.length;
                }

                if (status === 'completed' || status === 'completed_with_errors' || status === 'failed') {
                    eventSource.close();
                    
                    if (status === 'completed') {
                        statusText.textContent = `Sync Completed Successfully! (${successCount}/${total})`;
                        progressBar.classList.remove('from-indigo-500', 'to-cyan-400');
                        progressBar.classList.add('from-green-500', 'to-emerald-400');
                        syncForm.classList.remove('syncing-glow');
                        appendLog(`Sync Finished! Created ${successCount} items with ${errors.length} errors.`);
                    } else if (status === 'completed_with_errors') {
                        statusText.textContent = `Sync Completed With Errors (${successCount}/${total})`;
                        progressBar.classList.remove('from-indigo-500', 'to-cyan-400');
                        progressBar.classList.add('from-amber-500', 'to-orange-400');
                        syncForm.classList.remove('syncing-glow');
                        appendLog(`Sync Finished with partial success: ${successCount} created, ${errors.length} failed.`, true);
                    } else {
                        statusText.textContent = `Sync Failed. Created 0/${total}.`;
                        progressBar.classList.remove('from-indigo-500', 'to-cyan-400');
                        progressBar.classList.add('from-red-500', 'to-orange-500');
                        syncForm.classList.remove('syncing-glow');
                        appendLog(`Sync aborted with failure.`, true);
                    }
                    
                    setTimeout(() => {
                        resetUI();
                    }, 5000);
                }
            };
            
            eventSource.onerror = (err) => {
                appendLog('Connection to status server lost.', true);
                eventSource.close();
                resetUI();
            };

        } catch (error) {
            appendLog(`Error: ${error.message}`, true);
            alert(`Error: ${error.message}`);
            resetUI();
        }
    });
    
    function resetUI() {
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-75');
        submitBtn.innerHTML = `Start Sync Process`;
        syncForm.classList.remove('syncing-glow');
        window._lastErrorCount = 0;
    }
});
