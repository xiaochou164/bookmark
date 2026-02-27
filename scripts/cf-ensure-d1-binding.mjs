#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const options = {
    dbName: process.env.CF_D1_DB_NAME || 'rainboard',
    binding: 'DB',
    config: 'wrangler.toml',
    databaseId: '',
    skipCreate: false,
    printJson: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;

    if (!arg.startsWith('-') && !options._positionalConsumed) {
      options.dbName = arg;
      options._positionalConsumed = true;
      continue;
    }

    if (arg === '--binding') {
      options.binding = argv[++i] || options.binding;
      continue;
    }
    if (arg === '--config') {
      options.config = argv[++i] || options.config;
      continue;
    }
    if (arg === '--database-id') {
      options.databaseId = argv[++i] || '';
      continue;
    }
    if (arg === '--skip-create') {
      options.skipCreate = true;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  delete options._positionalConsumed;
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/cf-ensure-d1-binding.mjs [dbName] [options]

Create (or reuse) a Cloudflare D1 database and write the DB binding into wrangler.toml.

Options:
  --binding <name>       D1 binding name in wrangler.toml (default: DB)
  --config <path>        wrangler config path (default: wrangler.toml)
  --database-id <id>     Skip wrangler calls and patch config with this database ID
  --skip-create          Skip create and reuse an existing database via "wrangler d1 list"
  --json                 Print machine-readable result JSON
  -h, --help             Show this help
`);
}

function runWrangler(args) {
  const res = spawnSync('npx', ['--yes', 'wrangler', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  if (res.error) {
    throw new Error(`Failed to run npx wrangler: ${res.error.message}`);
  }
  return {
    ...res,
    stdout: res.stdout || '',
    stderr: res.stderr || ''
  };
}

function findJsonSpan(text, startIndex) {
  let inString = false;
  let escape = false;
  const stack = [];
  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }

    if (ch === '}' || ch === ']') {
      const last = stack[stack.length - 1];
      if ((ch === '}' && last === '{') || (ch === ']' && last === '[')) {
        stack.pop();
        if (stack.length === 0) {
          return [startIndex, i + 1];
        }
      } else {
        return null;
      }
    }
  }
  return null;
}

function parseFirstJson(text) {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== '{' && ch !== '[') continue;
    const span = findJsonSpan(text, i);
    if (!span) continue;
    const [start, end] = span;
    const candidate = text.slice(start, end);
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue scanning for the next JSON payload.
    }
  }
  return null;
}

function extractDatabaseId(payload) {
  if (!payload) return '';
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const id = extractDatabaseId(item);
      if (id) return id;
    }
    return '';
  }
  if (typeof payload !== 'object') return '';

  const direct = payload.database_id || payload.databaseId || payload.uuid || payload.id;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  if (payload.result) {
    return extractDatabaseId(payload.result);
  }
  if (payload.database) {
    return extractDatabaseId(payload.database);
  }
  if (payload.data) {
    return extractDatabaseId(payload.data);
  }

  return '';
}

function findDatabaseByName(payload, dbName) {
  if (Array.isArray(payload)) {
    return payload.find((row) => {
      if (!row || typeof row !== 'object') return false;
      return row.name === dbName || row.database_name === dbName;
    }) || null;
  }
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.result)) {
      return findDatabaseByName(payload.result, dbName);
    }
    if (Array.isArray(payload.databases)) {
      return findDatabaseByName(payload.databases, dbName);
    }
  }
  return null;
}

function quoteTomlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function parseActiveD1Blocks(lines) {
  const blocks = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*#/.test(line)) continue;
    if (!/^\s*\[\[d1_databases\]\]\s*$/.test(line)) continue;

    let end = i + 1;
    while (end < lines.length) {
      const next = lines[end];
      if (/^\s*#/.test(next)) {
        end += 1;
        continue;
      }
      if (/^\s*\[/.test(next)) break;
      end += 1;
    }

    blocks.push({ start: i, end });
    i = end - 1;
  }

  return blocks;
}

function readStringKey(lines, start, end, key) {
  const regex = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"\\s*$`);
  for (let i = start; i < end; i += 1) {
    const line = lines[i];
    if (/^\s*#/.test(line)) continue;
    const match = line.match(regex);
    if (match) return match[1];
  }
  return '';
}

function upsertStringKey(lines, start, end, key, value) {
  const regex = new RegExp(`^(\\s*)${key}\\s*=\\s*".*"\\s*$`);
  for (let i = start; i < end; i += 1) {
    const line = lines[i];
    if (/^\s*#/.test(line)) continue;
    const match = line.match(regex);
    if (match) {
      const nextLine = `${match[1]}${key} = ${quoteTomlString(value)}`;
      const changed = lines[i] !== nextLine;
      lines[i] = nextLine;
      return changed;
    }
  }

  lines.splice(end, 0, `${key} = ${quoteTomlString(value)}`);
  return true;
}

function ensureD1BindingBlock(content, { dbName, binding, databaseId }) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const hasTrailingNewline = /\r?\n$/.test(content);
  const lines = content.split(/\r?\n/);

  let blockChanged = false;
  let action = 'updated';

  const blocks = parseActiveD1Blocks(lines);
  let target = null;
  for (const block of blocks) {
    const blockBinding = readStringKey(lines, block.start + 1, block.end, 'binding');
    const blockName = readStringKey(lines, block.start + 1, block.end, 'database_name');
    const bindingMatch = !blockBinding || blockBinding === binding;
    const nameMatch = !blockName || blockName === dbName;
    if (bindingMatch && nameMatch) {
      target = block;
      if (blockBinding && blockBinding !== binding) continue;
      if (blockName && blockName !== dbName) continue;
      break;
    }
  }

  if (target) {
    blockChanged = upsertStringKey(lines, target.start + 1, target.end, 'binding', binding) || blockChanged;
    target.end = parseActiveD1Blocks(lines).find((b) => b.start === target.start)?.end || target.end;
    blockChanged = upsertStringKey(lines, target.start + 1, target.end, 'database_name', dbName) || blockChanged;
    target.end = parseActiveD1Blocks(lines).find((b) => b.start === target.start)?.end || target.end;
    blockChanged = upsertStringKey(lines, target.start + 1, target.end, 'database_id', databaseId) || blockChanged;
  } else {
    action = 'appended';
    blockChanged = true;
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('[[d1_databases]]');
    lines.push(`binding = ${quoteTomlString(binding)}`);
    lines.push(`database_name = ${quoteTomlString(dbName)}`);
    lines.push(`database_id = ${quoteTomlString(databaseId)}`);
  }

  const nextContent = `${lines.join(eol)}${hasTrailingNewline || blockChanged ? eol : ''}`;
  return {
    content: nextContent,
    changed: blockChanged || nextContent !== content,
    action
  };
}

function ensureConfigPatched(configPath, patchOptions) {
  const current = readFileSync(configPath, 'utf8');
  const result = ensureD1BindingBlock(current, patchOptions);
  if (result.changed) {
    writeFileSync(configPath, result.content, 'utf8');
  }
  return result;
}

function getDatabaseIdFromWrangler({ dbName, skipCreate }) {
  let createFailureLog = '';
  let createFailureStatus = null;

  if (!skipCreate) {
    const createRes = runWrangler(['d1', 'create', dbName, '--json']);
    const createPayload = parseFirstJson(createRes.stdout) || parseFirstJson(createRes.stderr);
    if (createRes.status === 0) {
      const id = extractDatabaseId(createPayload);
      if (!id) {
        throw new Error(
          `Failed to parse database_id from "wrangler d1 create ${dbName} --json" output.\n${createRes.stdout || createRes.stderr}`
        );
      }
      return { id, source: 'create' };
    }
    createFailureStatus = createRes.status;
    createFailureLog = `${createRes.stdout}\n${createRes.stderr}`.trim();
  }

  const listRes = runWrangler(['d1', 'list', '--json']);
  const listPayload = parseFirstJson(listRes.stdout) || parseFirstJson(listRes.stderr);
  if (listRes.status !== 0) {
    const listLog = (listRes.stdout + '\n' + listRes.stderr).trim();
    if (createFailureLog) {
      throw new Error(
        `wrangler d1 create failed (exit ${createFailureStatus ?? 'unknown'}) and fallback list also failed (exit ${listRes.status ?? 'unknown'}).\n` +
        `Create output:\n${createFailureLog}\n\nList output:\n${listLog}`
      );
    }
    throw new Error(
      `wrangler d1 list failed (exit ${listRes.status ?? 'unknown'}).\n${listLog}`
    );
  }
  const db = findDatabaseByName(listPayload, dbName);
  if (!db) {
    if (createFailureLog) {
      throw new Error(
        `wrangler d1 create failed and "${dbName}" was not found in "wrangler d1 list --json".\n${createFailureLog}`
      );
    }
    throw new Error(`D1 database "${dbName}" was not found in "wrangler d1 list --json".`);
  }
  const id = extractDatabaseId(db);
  if (!id) {
    throw new Error(`Found D1 database "${dbName}" but could not parse its database ID.`);
  }
  return { id, source: 'list' };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const configPath = resolve(process.cwd(), options.config);

  let source = 'arg';
  let databaseId = options.databaseId;
  if (!databaseId) {
    const result = getDatabaseIdFromWrangler({
      dbName: options.dbName,
      skipCreate: options.skipCreate
    });
    databaseId = result.id;
    source = result.source;
  }

  if (!databaseId) {
    throw new Error('database_id is empty.');
  }

  const patch = ensureConfigPatched(configPath, {
    dbName: options.dbName,
    binding: options.binding,
    databaseId
  });

  const payload = {
    ok: true,
    dbName: options.dbName,
    binding: options.binding,
    databaseId,
    source,
    config: configPath,
    patch: patch.action,
    changed: patch.changed
  };

  if (options.printJson) {
    console.log(JSON.stringify(payload));
    return;
  }

  console.log(
    `[cf:d1:ensure] ${source === 'arg' ? 'using provided' : `resolved from wrangler (${source})`} database_id: ${databaseId}`
  );
  console.log(
    `[cf:d1:ensure] ${patch.changed ? 'updated' : 'verified'} D1 binding (${options.binding}) in ${options.config}`
  );
}

try {
  main();
} catch (error) {
  console.error('[cf:d1:ensure] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
