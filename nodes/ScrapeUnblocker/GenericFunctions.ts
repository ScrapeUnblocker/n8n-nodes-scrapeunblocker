import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import type { OutputShape, PluginOperation } from './PluginOperations';

export const API_URL = 'https://api.scrapeunblocker.com';

// Plugins page through results and solve anti-bot checks on the server, so one call can take minutes.
const PLUGIN_TIMEOUT_MS = 300_000;

/**
 * Builds the query string of a plugin call from the node parameters: fixed values of the
 * operation, its fields, and the entries the user added to Options and Sort.
 */
export function pluginQuery(
	this: IExecuteFunctions,
	plugin: PluginOperation,
	itemIndex: number,
): IDataObject {
	const query: IDataObject = { ...plugin.fixed };
	for (const field of plugin.fields) {
		addParam(query, field.param, this.getNodeParameter(field.name, itemIndex, ''), field.skipZero);
	}
	for (const collection of ['options', 'sorting']) {
		const values = this.getNodeParameter(collection, itemIndex, {}) as IDataObject;
		for (const [name, value] of Object.entries(values)) {
			const field = plugin.collectionFields[name];
			if (field) {
				addParam(query, field.param, value, field.skipZero);
			}
		}
	}
	return query;
}

function addParam(query: IDataObject, param: string, value: unknown, skipZero?: boolean): void {
	if (value === undefined || value === null) {
		return;
	}
	if (Array.isArray(value)) {
		if (value.length > 0) {
			query[param] = value.join(',');
		}
		return;
	}
	if (typeof value === 'string') {
		const text = value.trim();
		if (text !== '') {
			query[param] = text;
		}
		return;
	}
	if (skipZero && value === 0) {
		return; // 0 means "no limit" in the node, so the API gets no value at all
	}
	query[param] = value as IDataObject[string];
}

/**
 * Calls a plugin endpoint and returns its JSON body. Non-2xx answers become a NodeApiError
 * that carries the API's own explanation.
 */
export async function callPlugin(
	this: IExecuteFunctions,
	plugin: PluginOperation,
	query: IDataObject,
	itemIndex: number,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method: 'POST',
		url: `${API_URL}${plugin.endpoint}`,
		qs: query,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		timeout: PLUGIN_TIMEOUT_MS,
	};
	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'scrapeUnblockerApi',
		options,
	)) as IN8nHttpFullResponse;
	const body = response.body as IDataObject | string;
	if (response.statusCode >= 400) {
		throw new NodeApiError(
			this.getNode(),
			{ message: apiMessage(body), httpCode: String(response.statusCode) } as JsonObject,
			{
				itemIndex,
				httpCode: String(response.statusCode),
				message: apiMessage(body),
				description: errorHint(response.statusCode),
			},
		);
	}
	return typeof body === 'object' && body !== null ? body : { result: body };
}

function apiMessage(body: IDataObject | string): string {
	if (typeof body === 'string') {
		return body.slice(0, 500) || 'The ScrapeUnblocker API returned no details';
	}
	const detail = body.detail ?? body.error ?? body.message;
	if (typeof detail === 'string') {
		return detail;
	}
	return JSON.stringify(detail ?? body).slice(0, 500);
}

// What to do next, per status class (n8n UX guidelines, "Errors").
function errorHint(status: number): string {
	if (status === 401 || status === 403) {
		return "Check the API key in the 'ScrapeUnblocker API' credential";
	}
	if (status === 404) {
		return 'The site has no such page, profile or item. Check the value you entered.';
	}
	if (status === 400 || status === 422) {
		return "Check the node's fields: the API could not use one of the values";
	}
	if (status === 429) {
		return 'Too many requests at once for this API key. Wait a moment, or run fewer items in parallel.';
	}
	return 'The site could not be read this time. Calls that fail are not billed, so you can run the node again.';
}

/**
 * Splits a plugin answer into n8n items: one per entry of the operation's result list (or of
 * several lists, each entry tagged with its `type`), the record under `itemKey` for
 * single-record operations, or else the whole answer as one item. Keys may be dot paths, and
 * a path through a list collects from every entry (`data.trips.flights`).
 */
export function resultItems(plugin: PluginOperation, body: IDataObject): IDataObject[] {
	if (plugin.itemKey) {
		const record = valueAt(body, plugin.itemKey);
		return [typeof record === 'object' && record !== null ? (record as IDataObject) : body];
	}
	if (plugin.listKeys) {
		return plugin.listKeys.flatMap(({ key, type }) =>
			listAt(body, key.split('.')).map((entry) => ({ type, ...asItem(entry) })),
		);
	}
	if (!plugin.listKey) {
		return [body];
	}
	if (valueAt(body, plugin.listKey.split('.')[0]) === undefined) {
		return [body]; // an answer without the list, e.g. a message instead of results
	}
	return listAt(body, plugin.listKey.split('.')).map(asItem);
}

function asItem(entry: unknown): IDataObject {
	return typeof entry === 'object' && entry !== null
		? (entry as IDataObject)
		: { value: entry as IDataObject[string] };
}

function listAt(value: unknown, keys: string[]): unknown[] {
	if (Array.isArray(value)) {
		return keys.length ? value.flatMap((entry) => listAt(entry, keys)) : value;
	}
	if (value === null || value === undefined) {
		return [];
	}
	if (!keys.length) {
		return [value];
	}
	return typeof value === 'object' ? listAt((value as IDataObject)[keys[0]], keys.slice(1)) : [];
}

function simplifiedKey(path: string): string {
	const [first, ...rest] = path.split('.');
	return first + rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function valueAt(item: IDataObject, path: string): unknown {
	let value: unknown = item;
	for (const key of path.split('.')) {
		if (value === null || typeof value !== 'object') {
			return undefined;
		}
		value = (value as IDataObject)[key];
	}
	return value;
}

/**
 * Applies the output setting: the regular node shows 'Simplify', the AI tool shows 'Output'
 * (Simplified, Raw or Selected Fields), as the n8n UX guidelines ask for items with more than
 * 10 fields. Operations without a shape return their items unchanged.
 */
export function shapeItems(
	this: IExecuteFunctions,
	items: IDataObject[],
	shape: OutputShape | undefined,
	itemIndex: number,
): IDataObject[] {
	if (!shape) {
		return items;
	}
	const output = this.getNodeParameter('output', itemIndex, '') as string;
	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
	const mode = output || (simplify ? 'simple' : 'raw');
	if (mode === 'raw') {
		return items;
	}
	if (mode === 'fields') {
		const selected = this.getNodeParameter('fields', itemIndex, []) as string[];
		const keep = [...(shape.idFields ?? []), ...selected];
		return items.map((item) => {
			const picked: IDataObject = {};
			for (const key of keep) {
				if (key in item) {
					picked[key] = item[key];
				}
			}
			return picked;
		});
	}
	return items.map((item) => {
		const simplified: IDataObject = {};
		for (const entry of shape.simplified) {
			// "path:name" renames a field whose own key is cryptic (`vndr:vendor`).
			const [path, name] = entry.split(':');
			const value = valueAt(item, path);
			simplified[name ?? simplifiedKey(path)] =
				value === undefined ? null : (value as IDataObject[string]);
		}
		return simplified;
	});
}
