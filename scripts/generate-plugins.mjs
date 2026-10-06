#!/usr/bin/env node
// Renders the plugin resources of the node from plugins/specs/*.json:
//   nodes/ScrapeUnblocker/PluginsDescription.ts - node parameters (linted like the node file)
//   nodes/ScrapeUnblocker/PluginOperations.ts   - endpoint and parameter mapping used by execute()
// Checks every spec against plugins/openapi.json (the API's public OpenAPI) first.
//
// Usage: node scripts/generate-plugins.mjs   (then npm run lint && npm run build)
//        node scripts/generate-plugins.mjs --check plugins/specs/<name>.json ...

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_DIR = join(ROOT, 'plugins', 'specs');
const NODE_DIR = join(ROOT, 'nodes', 'ScrapeUnblocker');
const MAX_SIMPLIFIED_FIELDS = 10;
// Names the node itself uses; the Web Page operations keep their API-key names.
const RESERVED = new Set(['resource', 'operation', 'options', 'sorting', 'simplify', 'output', 'fields']);
const WEB_PAGE_TYPES = { url: 'string', proxy_country: 'options', method: 'options', value: 'string' };
const FIELD_TYPES = new Set(['string', 'number', 'boolean', 'options', 'multiOptions', 'dateTime']);

const openapi = JSON.parse(readFileSync(join(ROOT, 'plugins', 'openapi.json'), 'utf8'));
const countries = JSON.parse(readFileSync(join(ROOT, 'plugins', 'countries.json'), 'utf8'));

function fail(message) {
	console.error(`generate-plugins: ${message}`);
	process.exit(1);
}

function loadSpecs(only) {
	return readdirSync(SPEC_DIR)
		.filter((file) => file.endsWith('.json') && (!only.length || only.includes(file)))
		.sort()
		.map((file) => ({ file, ...JSON.parse(readFileSync(join(SPEC_DIR, file), 'utf8')) }));
}

// An operation with "disabled": "<reason>" stays in its spec but is left out of the node (e.g. while
// the site blocks the API); a resource with no enabled operation is left out entirely.
function enabledSpecs(specs) {
	return specs
		.map((spec) => ({ ...spec, operations: spec.operations.filter((op) => !op.disabled) }))
		.filter((spec) => spec.operations.length);
}

function apiParams(endpoint) {
	const operation = openapi.paths[endpoint]?.post;
	if (!operation) fail(`${endpoint} is not in plugins/openapi.json`);
	return new Map((operation.parameters ?? []).map((param) => [param.name, param]));
}

function allFields(operation) {
	return [...(operation.fields ?? []), ...(operation.options ?? []), ...(operation.sort ?? [])];
}

function validate(specs) {
	const typeByName = new Map(Object.entries(WEB_PAGE_TYPES));
	const resources = new Set();
	for (const spec of specs) {
		const where = spec.file;
		if (resources.has(spec.value)) fail(`${where}: duplicate resource ${spec.value}`);
		resources.add(spec.value);
		const operations = new Set();
		for (const operation of spec.operations) {
			const at = `${where} ${operation.value}`;
			if (operations.has(operation.value)) fail(`${at}: duplicate operation`);
			operations.add(operation.value);
			const params = apiParams(operation.endpoint);
			const names = new Set();
			for (const field of allFields(operation)) {
				const name = field.name ?? field.param;
				if (!FIELD_TYPES.has(field.type)) fail(`${at}: ${name} has unknown type ${field.type}`);
				if (!params.has(field.param)) fail(`${at}: ${field.param} is not a parameter of ${operation.endpoint}`);
				if (names.has(name)) fail(`${at}: duplicate field ${name}`);
				if (RESERVED.has(name)) fail(`${at}: ${name} is reserved for the node`);
				names.add(name);
				const known = typeByName.get(name);
				if (known && known !== field.type && (operation.fields ?? []).includes(field)) {
					fail(`${at}: ${name} is a ${field.type} here but a ${known} elsewhere - rename it`);
				}
				if ((operation.fields ?? []).includes(field)) typeByName.set(name, field.type);
			}
			for (const [param, info] of params) {
				const covered = allFields(operation).some((field) => field.param === param);
				if (info.required && !covered && !(param in (operation.fixed ?? {}))) {
					fail(`${at}: required parameter ${param} has no field`);
				}
			}
			for (const param of Object.keys(operation.fixed ?? {})) {
				if (!params.has(param)) fail(`${at}: fixed ${param} is not a parameter of ${operation.endpoint}`);
			}
			if (operation.simplify) {
				if (operation.simplify.length > MAX_SIMPLIFIED_FIELDS) {
					fail(`${at}: simplify lists ${operation.simplify.length} fields, at most ${MAX_SIMPLIFIED_FIELDS}`);
				}
				if (!operation.outputFields?.length) fail(`${at}: simplify needs outputFields`);
				const missing = operation.simplify.filter(
					(entry) => !operation.outputFields.includes(entry.split(':')[0].split('.')[0]),
				);
				if (missing.length) fail(`${at}: simplify paths not in outputFields: ${missing}`);
				if (operation.idField && !operation.outputFields.includes(operation.idField)) {
					fail(`${at}: idField ${operation.idField} not in outputFields`);
				}
			}
		}
	}
}

const LABEL_WORDS = { id: 'ID', ids: 'IDs', url: 'URL', urls: 'URLs', ai: 'AI', html: 'HTML', asin: 'ASIN' };

function fieldLabel(path) {
	const words = path.replace(/[._]/g, ' ').match(/[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/g) ?? [path];
	return words.map((word) => LABEL_WORDS[word.toLowerCase()] ?? word[0].toUpperCase() + word.slice(1)).join(' ');
}

function byName(a, b) {
	return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

function byDisplayName(a, b) {
	return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
}

function property(field, show) {
	const prop = {
		displayName: field.displayName,
		name: field.name ?? field.param,
		type: field.type,
	};
	if (field.required) prop.required = true;
	const typeOptions = {};
	if (field.min !== undefined) typeOptions.minValue = field.min;
	if (field.max !== undefined) typeOptions.maxValue = field.max;
	if (field.rows) typeOptions.rows = field.rows;
	if (Object.keys(typeOptions).length) prop.typeOptions = typeOptions;
	if (field.options === 'countries') {
		prop.options = [...countries].sort(byName);
	} else if (field.options) {
		prop.options = [...field.options].sort(byName);
	}
	prop.default = field.default ?? (field.type === 'multiOptions' ? [] : field.type === 'boolean' ? false : '');
	if (field.placeholder) {
		prop.placeholder = field.placeholder.startsWith('e.g.') ? field.placeholder : `e.g. ${field.placeholder}`;
	}
	if (field.description) prop.description = field.description;
	if (show) prop.displayOptions = { show };
	return prop;
}

function outputProperties(operation, show) {
	if (!operation.simplify) return [];
	const labels = operation.simplify.map((entry) => fieldLabel(entry.split(':').pop())).join(', ');
	let fieldsDescription = 'The fields to send to the agent';
	if (operation.idField) fieldsDescription += `. ${fieldLabel(operation.idField)} is always included.`;
	return [
		{
			displayName: 'Simplify',
			name: 'simplify',
			type: 'boolean',
			default: true,
			description: 'Whether to return a simplified version of the response instead of the raw data',
			displayOptions: { show: { ...show, '@tool': [false] } },
		},
		{
			displayName: 'Output',
			name: 'output',
			type: 'options',
			default: 'simple',
			description: 'Which fields of each result to send to the agent',
			options: [
				{ name: 'Raw', value: 'raw', description: 'Send all the available fields' },
				{ name: 'Selected Fields', value: 'fields', description: 'Send only the fields you select' },
				{ name: 'Simplified', value: 'simple', description: `Send the most useful fields (${labels})` },
			],
			displayOptions: { show: { ...show, '@tool': [true] } },
		},
		{
			displayName: 'Fields',
			name: 'fields',
			type: 'multiOptions',
			default: [],
			description: fieldsDescription,
			options: operation.outputFields.map((key) => ({ name: fieldLabel(key), value: key })).sort(byName),
			displayOptions: { show: { ...show, '@tool': [true], output: ['fields'] } },
		},
	];
}

function buildDescription(specs) {
	const resourceOptions = [
		{ name: 'Web Page', value: 'webPage' },
		...specs.map((spec) => ({ name: spec.resource, value: spec.value })),
	].sort(byName);
	const props = [];
	for (const spec of specs) {
		props.push({
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { resource: [spec.value] } },
			options: spec.operations
				.map((op) => ({ name: op.name, value: op.value, description: op.description, action: op.action }))
				.sort(byName),
			default: spec.operations[0].value,
		});
	}
	for (const spec of specs) {
		for (const operation of spec.operations) {
			const show = { resource: [spec.value], operation: [operation.value] };
			props.push(...(operation.fields ?? []).map((field) => property(field, show)));
			props.push(...outputProperties(operation, show));
			if (operation.options?.length) {
				props.push({
					displayName: 'Options',
					name: 'options',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					displayOptions: { show },
					options: operation.options.map((field) => property(field)).sort(byDisplayName),
				});
			}
			if (operation.sort?.length) {
				props.push({
					displayName: 'Sort',
					name: 'sorting',
					type: 'collection',
					placeholder: 'Add Sort Rule',
					default: {},
					displayOptions: { show },
					options: operation.sort.map((field) => property(field)).sort(byDisplayName),
				});
			}
		}
	}
	return { resourceOptions, props };
}

function buildOperations(specs) {
	const operations = {};
	for (const spec of specs) {
		for (const operation of spec.operations) {
			const mapField = (field) => {
				const entry = { name: field.name ?? field.param, param: field.param };
				if (field.skipZero) entry.skipZero = true;
				return entry;
			};
			const collectionFields = {};
			for (const field of [...(operation.options ?? []), ...(operation.sort ?? [])]) {
				const entry = mapField(field);
				collectionFields[entry.name] = entry;
			}
			const plugin = {
				endpoint: operation.endpoint,
				fixed: operation.fixed ?? {},
				fields: (operation.fields ?? []).map(mapField),
				collectionFields,
			};
			if (operation.listKey && operation.listKeys) fail(`${spec.value} ${operation.value}: listKey or listKeys, not both`);
			if (operation.listKey) plugin.listKey = operation.listKey;
			if (operation.listKeys) plugin.listKeys = operation.listKeys;
			if (operation.itemKey) plugin.itemKey = operation.itemKey;
			if (operation.simplify) {
				plugin.shape = { simplified: operation.simplify };
				if (operation.idField) plugin.shape.idFields = [operation.idField];
			}
			operations[`${spec.value}:${operation.value}`] = plugin;
		}
	}
	return operations;
}

function literal(value) {
	return JSON.stringify(value, null, '\t');
}

const HEADER = '// Generated by scripts/generate-plugins.mjs from plugins/specs/*.json - do not edit by hand.\n';

// --check <spec.json ...>: validate only those specs and write nothing (safe while others edit specs).
const checkOnly = process.argv[2] === '--check';
const allSpecs = loadSpecs(checkOnly ? process.argv.slice(3).map((path) => path.split('/').pop()) : []);
validate(allSpecs);
const specs = enabledSpecs(allSpecs);
if (checkOnly) {
	const count = allSpecs.reduce((sum, spec) => sum + spec.operations.length, 0);
	console.log(`generate-plugins: ${allSpecs.length} spec(s), ${count} operation(s) valid`);
	process.exit(0);
}
const { resourceOptions, props } = buildDescription(specs);
const operations = buildOperations(specs);

writeFileSync(
	join(NODE_DIR, 'PluginsDescription.ts'),
	`${HEADER}import type { INodeProperties } from 'n8n-workflow';

export const resourceProperty: INodeProperties = ${literal({
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: resourceOptions,
		default: 'webPage',
	})};

export const pluginProperties: INodeProperties[] = ${literal(props)};
`,
);
writeFileSync(
	join(NODE_DIR, 'PluginOperations.ts'),
	`${HEADER}import type { IDataObject } from 'n8n-workflow';

export interface PluginField {
	/** Node parameter name. */
	name: string;
	/** API query parameter it is sent as. */
	param: string;
	/** 0 means "no limit" in the node, so it is not sent. */
	skipZero?: boolean;
}

export interface OutputShape {
	/** Fields kept by Simplify; dot paths are flattened (\`seller.username\` -> \`sellerUsername\`), \`path:name\` renames. */
	simplified: string[];
	/** Always returned with Selected Fields when the item has them. */
	idFields?: string[];
}

export interface PluginOperation {
	endpoint: string;
	fixed: IDataObject;
	fields: PluginField[];
	/** Entries of the Options and Sort collections, by node parameter name. */
	collectionFields: Record<string, PluginField>;
	/** Response key (or dot path) holding the result list; without it the whole answer is one item. */
	listKey?: string;
	/** Several result lists, each entry tagged with its \`type\` (search results and ads). */
	listKeys?: { key: string; type: string }[];
	/** Response key (or dot path) holding the single record of a "get one" operation. */
	itemKey?: string;
	shape?: OutputShape;
}

export const PLUGIN_OPERATIONS: Record<string, PluginOperation> = ${literal(operations)};
`,
);

// README: the table between the plugin markers lists every resource and operation.
const README = join(ROOT, 'README.md');
const START = '<!-- plugins:start -->';
const END = '<!-- plugins:end -->';
const rows = specs.flatMap((spec) =>
	spec.operations.map(
		(op) =>
			`| **${spec.resource}** | ${op.name} | ${op.description} | ${op.listKey || op.listKeys ? 'One item per result' : 'One item'}${op.simplify ? ', Simplify' : ''} |`,
	),
);
const table = [START, '| Resource | Operation | What it does | Output |', '|---|---|---|---|', ...rows, END].join('\n');
const readme = readFileSync(README, 'utf8');
if (!readme.includes(START) || !readme.includes(END)) fail('README.md has no plugin markers');
writeFileSync(README, readme.replace(new RegExp(`${START}[\\s\\S]*?${END}`), table));

// Codex aliases: the site names, so the node shows up when users search n8n for "eBay" or "TikTok".
const CODEX = join(NODE_DIR, 'ScrapeUnblocker.node.json');
const codex = JSON.parse(readFileSync(CODEX, 'utf8'));
codex.alias = [...new Set(['scraper', 'web scraping', 'unblock', ...specs.map((spec) => spec.resource)])];
writeFileSync(CODEX, JSON.stringify(codex, null, '\t') + '\n');

const files = ['nodes/ScrapeUnblocker/PluginsDescription.ts', 'nodes/ScrapeUnblocker/PluginOperations.ts'];
execFileSync('npx', ['prettier', '--write', ...files], { cwd: ROOT, stdio: 'ignore' });
// Title case, final periods and similar style rules are left to the linter's autofix.
try {
	execFileSync('npx', ['eslint', '--fix', ...files], { cwd: ROOT, stdio: 'ignore' });
} catch {
	// Remaining lint findings are reported by `npm run lint`.
}
execFileSync('npx', ['prettier', '--write', ...files], { cwd: ROOT, stdio: 'ignore' });
const count = Object.keys(operations).length;
const disabled = allSpecs.flatMap((spec) =>
	spec.operations.filter((op) => op.disabled).map((op) => `${spec.value}:${op.value}`),
);
console.log(`generate-plugins: ${specs.length} resources, ${count} operations`);
if (disabled.length) console.log(`generate-plugins: disabled ${disabled.join(', ')}`);
