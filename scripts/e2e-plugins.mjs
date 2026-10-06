#!/usr/bin/env node
// End-to-end test of the plugin operations: runs each spec's `test` through the built node in a
// throwaway docker n8n, against the real ScrapeUnblocker API (every test is a billed call).
//
// Usage: SCRAPEUNBLOCKER_API_KEY=... node scripts/e2e-plugins.mjs [resource[:operation] ...]
// Needs docker and a fresh `npm run build`. Results: plugins/e2e-results.json (+ one sample item
// per operation in plugins/samples/, which is what the README examples are drawn from).

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_PORT ?? 5699);
const CONTAINER = `n8n-scrapeunblocker-e2e-${PORT}`;
const BASE = `http://localhost:${PORT}`;
const OWNER = { email: 'e2e@example.com', firstName: 'E2E', lastName: 'Test', password: 'E2eTest123!' };
const PARALLEL = Number(process.env.E2E_PARALLEL ?? 4);
const apiKey = process.env.SCRAPEUNBLOCKER_API_KEY;
if (!apiKey) {
	console.error('Set SCRAPEUNBLOCKER_API_KEY');
	process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let cookie = '';

async function rest(method, path, body) {
	const response = await fetch(`${BASE}${path}`, {
		method,
		headers: { 'content-type': 'application/json', cookie },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const setCookie = response.headers.get('set-cookie');
	if (setCookie) cookie = setCookie.split(';')[0];
	const text = await response.text();
	if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
	return text ? JSON.parse(text).data : undefined;
}

async function startN8n() {
	spawnSync('docker', ['rm', '-f', '-v', CONTAINER]);
	execFileSync('docker', [
		'run', '-d', '--name', CONTAINER, '-p', `${PORT}:5678`,
		'-v', `${ROOT}:/custom-nodes/n8n-nodes-scrapeunblocker:ro`,
		'-e', 'N8N_CUSTOM_EXTENSIONS=/custom-nodes/n8n-nodes-scrapeunblocker/dist',
		'-e', 'N8N_DIAGNOSTICS_ENABLED=false', '-e', 'N8N_SECURE_COOKIE=false',
		'docker.n8n.io/n8nio/n8n:latest',
	]);
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			await rest('POST', '/rest/owner/setup', OWNER);
			await rest('POST', '/rest/login', { emailOrLdapLoginId: OWNER.email, password: OWNER.password });
			return;
		} catch {
			await sleep(3000);
		}
	}
	throw new Error('n8n did not start');
}

// Web Page operations are hand-written in the node. `legacy` is a node saved before resources
// existed (no resource/operation parameters): it must keep running Get Page Source.
const CORE_TESTS = [
	{ key: 'webPage:legacy', legacy: true, params: { url: 'https://example.com' }, minItems: 1 },
	{
		key: 'webPage:getImage',
		resource: 'webPage',
		operation: 'getImage',
		params: { url: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png' },
		minItems: 1,
		expectBinary: true,
	},
];

function loadTests(filters) {
	const tests = CORE_TESTS.filter((test) => !filters.length || filters.some((f) => test.key.startsWith(f)));
	for (const file of readdirSync(join(ROOT, 'plugins', 'specs')).sort()) {
		const spec = JSON.parse(readFileSync(join(ROOT, 'plugins', 'specs', file), 'utf8'));
		for (const operation of spec.operations) {
			const key = `${spec.value}:${operation.value}`;
			if (!operation.test || operation.disabled) continue;
			if (filters.length && !filters.some((f) => key === f || spec.value === f)) continue;
			tests.push({ key, resource: spec.value, operation: operation.value, ...operation.test });
		}
	}
	return tests;
}

async function createWorkflow(test, credentialId) {
	const parameters = test.legacy
		? { ...test.params }
		: { resource: test.resource, operation: test.operation, ...test.params, options: test.options ?? {} };
	const workflow = await rest('POST', '/rest/workflows', {
		name: `e2e ${test.key}`,
		nodes: [
			{ parameters: {}, id: 't', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] },
			{
				parameters,
				id: 'n',
				name: 'Node',
				type: 'CUSTOM.scrapeUnblocker',
				typeVersion: 1,
				position: [220, 0],
				credentials: { scrapeUnblockerApi: { id: credentialId, name: 'ScrapeUnblocker' } },
			},
		],
		connections: { Start: { main: [[{ node: 'Node', type: 'main', index: 0 }]] } },
		settings: {},
		active: false,
	});
	return workflow.id;
}

function execute(workflowId, brokerPort) {
	const result = spawnSync(
		'docker',
		['exec', '-e', `N8N_RUNNERS_BROKER_PORT=${brokerPort}`, CONTAINER, 'n8n', 'execute', '--id', workflowId, '--rawOutput'],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600_000 },
	);
	const start = result.stdout.indexOf('{');
	if (start < 0) throw new Error(`no output: ${result.stderr.slice(-300)}`);
	return JSON.parse(firstJsonObject(result.stdout.slice(start)));
}

// The CLI may print more text after the run's JSON (an error stack), so cut at the object's end.
function firstJsonObject(text) {
	let depth = 0;
	let inString = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (inString) {
			if (char === '\\') i++;
			else if (char === '"') inString = false;
		} else if (char === '"') inString = true;
		else if (char === '{') depth++;
		else if (char === '}' && --depth === 0) return text.slice(0, i + 1);
	}
	return text;
}

function evaluate(test, raw) {
	const runData = raw.data.resultData;
	const nodeRun = runData.runData.Node?.[0];
	const error = runData.error ?? nodeRun?.error;
	if (error) {
		const message = `${error.message ?? ''} ${error.description ?? ''}`.trim();
		return { ok: Boolean(test.expectError && message.includes(test.expectError)), items: 0, message };
	}
	const items = nodeRun.data.main[0].map((item) => item.json);
	const hasBinary = nodeRun.data.main[0].every((item) => item.binary?.data);
	const widest = Math.max(0, ...items.map((item) => Object.keys(item).length));
	const problems = [];
	if (items.length < (test.minItems ?? 1)) problems.push(`${items.length} items, expected at least ${test.minItems ?? 1}`);
	if (test.maxItems !== undefined && items.length > test.maxItems) problems.push(`${items.length} items, more than ${test.maxItems}`);
	if (test.maxFields !== undefined && widest > test.maxFields) problems.push(`an item has ${widest} fields`);
	if (test.expectError) problems.push('expected an error');
	if (test.expectBinary && !hasBinary) problems.push('no binary data');
	if (!problems.length && items.length) {
		mkdirSync(join(ROOT, 'plugins', 'samples'), { recursive: true });
		writeFileSync(join(ROOT, 'plugins', 'samples', `${test.key.replace(':', '--')}.json`), JSON.stringify(items[0], null, 2) + '\n');
	}
	return { ok: !problems.length, items: items.length, message: problems.join('; ') };
}

const tests = loadTests(process.argv.slice(2));
console.log(`running ${tests.length} tests`);
await startN8n();
const credential = await rest('POST', '/rest/credentials', {
	name: 'ScrapeUnblocker',
	type: 'scrapeUnblockerApi',
	data: { apiKey },
});
const results = [];
let next = 0;
async function worker(slot) {
	while (next < tests.length) {
		const test = tests[next++];
		const started = Date.now();
		let outcome;
		try {
			const workflowId = await createWorkflow(test, credential.id);
			outcome = evaluate(test, execute(workflowId, PORT + 100 + slot));
		} catch (error) {
			outcome = { ok: false, items: 0, message: String(error).slice(0, 300) };
		}
		outcome = { key: test.key, seconds: Math.round((Date.now() - started) / 1000), ...outcome };
		results.push(outcome);
		console.log(`${outcome.ok ? 'PASS' : 'FAIL'} ${test.key} items=${outcome.items} ${outcome.seconds}s ${outcome.message}`);
	}
}
await Promise.all(Array.from({ length: PARALLEL }, (_, slot) => worker(slot)));
spawnSync('docker', ['rm', '-f', '-v', CONTAINER]);
// Keep earlier results of operations that were not part of this run.
const resultsFile = join(ROOT, 'plugins', 'e2e-results.json');
let previous = [];
try {
	previous = JSON.parse(readFileSync(resultsFile, 'utf8'));
} catch {
	previous = [];
}
const tested = new Set(results.map((result) => result.key));
const merged = [...previous.filter((result) => !tested.has(result.key)), ...results];
merged.sort((a, b) => a.key.localeCompare(b.key));
writeFileSync(resultsFile, JSON.stringify(merged, null, 2) + '\n');
const failed = results.filter((result) => !result.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
