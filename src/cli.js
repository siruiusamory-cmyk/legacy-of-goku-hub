import fs from 'node:fs/promises';
import path from 'node:path';
import {GitHub} from './github.js';
import {loadRecords, readJSON, saveJSON, parseIssue, validateRecord} from './records.js';
import {buildCatalog} from './catalog.js';
import {refresh, validateSubmission, copyStaged, checkPendingDuplicates} from './pipeline.js';
import {processImages} from './images.js';

const root = process.cwd();
const command = process.argv[2];
const cacheFile = path.join(root, '.cache', 'github.json');
let cache = {};
try { cache = await readJSON(cacheFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const api = new GitHub({cache});
try {
  if (command === 'validate') { await loadRecords(root); await buildCatalog(root); }
  else if (command === 'build') await buildCatalog(root);
  else if (command === 'refresh') await refresh(root, api);
  else if (command === 'images') {
    const record = (await loadRecords(root)).find(r => r.id === process.argv[3]);
    if (!record) throw Error('images: provide an existing approved project ID');
    await processImages(record, root);
  }
  else if (command === 'submission' || command === 'stage') {
    const slug = process.env.GITHUB_REPOSITORY;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(slug || '')) throw Error('GITHUB_REPOSITORY must be OWNER/REPO');
    const number = process.env.ISSUE_NUMBER;
    if (!/^[1-9][0-9]{0,8}$/.test(number || '')) throw Error('ISSUE_NUMBER must be a positive integer');
    const issue = await api.request(`/repos/${slug}/issues/${number}`);
    if (issue.pull_request || issue.state !== 'open' || !issue.user?.login) throw Error('expected an open submission issue');
    const staged = path.join(root, '.staging');
    await fs.rm(staged, {recursive: true, force: true});
    try {
      await checkPendingDuplicates(api, slug, number, validateRecord(parseIssue(issue.body)));
      const record = await validateSubmission({root, body: issue.body, login: issue.user.login, api, output: staged});
      if (command === 'stage') await copyStaged(root, staged);
      else await api.request(`/repos/${slug}/issues/${number}/comments`, {method: 'POST', body: {body: `Validation passed for \`${record.id}\`. A moderator must review ownership, content rights and distribution before staging approval. No malware-safety guarantee is provided.`}});
    } catch (error) {
      if (command === 'submission') await api.request(`/repos/${slug}/issues/${number}/comments`, {method: 'POST', body: {body: `Validation failed. Correct the Project record and edit this issue to retry.\n\n\`\`\`text\n${error.message.replaceAll('`', '').slice(0, 3000)}\n\`\`\``}});
      throw error;
    }
  } else throw Error('usage: node src/cli.js validate|build|refresh|images ID|submission|stage');
  await saveJSON(cacheFile, api.cache);
  console.log(`${command}: OK`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
