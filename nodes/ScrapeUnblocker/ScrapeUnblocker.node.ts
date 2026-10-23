import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
	NodeOperationError,
	NodeConnectionTypes,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	INodePropertyOptions,
	JsonObject,
	INodeProperties,
} from 'n8n-workflow';

import {
	API_URL,
	apiMessage,
	callPlugin,
	errorHint,
	pluginQuery,
	resultItems,
	shapeItems,
} from './GenericFunctions';
import { PLUGIN_OPERATIONS } from './PluginOperations';
import { pluginProperties, resourceProperty } from './PluginsDescription';

const TARGET_GONE = new Set([404, 410]);

/**
 * The target's own "page does not exist" answer (404/410), or null.
 *
 * `/getPageSource` always exists, so a 404/410 from it is the target site's
 * answer, sent with `X-Origin-Status`. Older API versions returned that same
 * answer as a 200 carrying the header, so the header is checked first.
 */
function targetGoneStatus(status: number, originStatus: unknown): number | null {
	const origin = Number(Array.isArray(originStatus) ? originStatus[0] : originStatus);
	if (TARGET_GONE.has(origin)) return origin;
	return TARGET_GONE.has(status) ? status : null;
}

// The Web Page operations that show each parameter; any other parameter is Get Page Source only.
// Get Markdown has no Parsed Data or List Elements: the API refuses them with markdown (422).
const WEB_PAGE_OPERATIONS: Record<string, string[]> = {
	url: ['getImage', 'getMarkdown', 'getPageSource'],
	proxy_country: ['getImage', 'getMarkdown', 'getPageSource'],
	main_content_only: ['getMarkdown'],
	method: ['getMarkdown', 'getPageSource'],
	value: ['getMarkdown', 'getPageSource'],
	steps: ['getMarkdown', 'getPageSource'],
};

/** The Web Page parameters keep the API's query keys as names, as before resources existed. */
function webPageParameter(property: INodeProperties): INodeProperties {
	const operation = WEB_PAGE_OPERATIONS[property.name] ?? ['getPageSource'];
	const show = {
		resource: ['webPage'],
		operation,
		...(property.displayOptions?.show ?? {}),
	};
	return { ...property, displayOptions: { show } };
}

// File extension for the image type /getImage answers with (the image's own type).
const IMAGE_EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/gif': 'gif',
	'image/svg+xml': 'svg',
	'image/x-icon': 'ico',
	'image/vnd.microsoft.icon': 'ico',
	'image/bmp': 'bmp',
	'image/tiff': 'tiff',
	'image/heic': 'heic',
	'image/heif': 'heif',
	'image/jxl': 'jxl',
};

function imageFileName(url: string, mimeType: string): string {
	const last = url.split('?')[0].split('/').pop() ?? '';
	const base = last.replace(/\.[a-z0-9]+$/i, '') || 'image';
	const ext = IMAGE_EXTENSIONS[mimeType] ?? mimeType.replace(/^image\//, '').replace(/[^a-z0-9]/gi, '');
	return `${base}.${ext || 'img'}`;
}

function headerValue(value: unknown): string {
	return String(Array.isArray(value) ? value[0] : (value ?? ''));
}

export class ScrapeUnblocker implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ScrapeUnblocker',
		name: 'scrapeUnblocker',
		icon: {
			light: 'file:scrapeunblocker.svg',
			dark: 'file:scrapeunblocker.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle:
			'={{$parameter["resource"] === "webPage" ? $parameter["url"] : $parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Unblock and scrape any website, or get structured data from Amazon, eBay, Google, TikTok and many more sites, with the ScrapeUnblocker API',
		defaults: {
			name: 'ScrapeUnblocker',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],

		// This enables AI Agents to use your node to "search" or "read" the web
		usableAsTool: true,

		credentials: [
			{
				name: 'scrapeUnblockerApi',
				required: true,
			},
		],
		properties: [
			resourceProperty,
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['webPage'] } },
				options: [
					{
						name: 'Get Image',
						value: 'getImage',
						description: 'Download one image from a protected site in its original format',
						action: 'Get image',
					},
					{
						name: 'Get Markdown',
						value: 'getMarkdown',
						description:
							'Fetch any page past anti-bot protection as clean Markdown for LLMs, AI agents and RAG',
						action: 'Get markdown',
					},
					{
						name: 'Get Page Source',
						value: 'getPageSource',
						description: "Fetch any page's HTML (or structured JSON) past anti-bot protection",
						action: 'Get page source',
					},
				],
				default: 'getPageSource',
			},
			...(
				[
					{
						displayName: 'URL',
						name: 'url',
						type: 'string',
						default: '',
						placeholder: 'e.g. https://example.com',
						required: true,
						description: 'The URL of the webpage (or, for Get Image, the image) to fetch',
					},
					{
						displayName: 'Browse From Country',
						name: 'proxy_country',
						type: 'options',
						default: '',
						description:
							'The country the site is opened from. Random (European) picks a European country.',
						options: [
							{ name: 'Random (European)', value: '' },
							{ name: 'Austria (AT)', value: 'AT' },
							{ name: 'Belgium (BE)', value: 'BE' },
							{ name: 'Brazil (BR)', value: 'BR' },
							{ name: 'Bulgaria (BG)', value: 'BG' },
							{ name: 'Canada (CA)', value: 'CA' },
							{ name: 'China (CN)', value: 'CN' },
							{ name: 'Croatia (HR)', value: 'HR' },
							{ name: 'Denmark (DK)', value: 'DK' },
							{ name: 'Estonia (EE)', value: 'EE' },
							{ name: 'France (FR)', value: 'FR' },
							{ name: 'Germany (DE)', value: 'DE' },
							{ name: 'Greece (GR)', value: 'GR' },
							{ name: 'Hong Kong (HK)', value: 'HK' },
							{ name: 'Ireland (IE)', value: 'IE' },
							{ name: 'Israel (IL)', value: 'IL' },
							{ name: 'Italy (IT)', value: 'IT' },
							{ name: 'Japan (JP)', value: 'JP' },
							{ name: 'Latvia (LV)', value: 'LV' },
							{ name: 'Lithuania (LT)', value: 'LT' },
							{ name: 'Luxembourg (LU)', value: 'LU' },
							{ name: 'Moldova (MD)', value: 'MD' },
							{ name: 'Netherlands (NL)', value: 'NL' },
							{ name: 'Norway (NO)', value: 'NO' },
							{ name: 'Poland (PL)', value: 'PL' },
							{ name: 'Romania (RO)', value: 'RO' },
							{ name: 'Serbia (RS)', value: 'RS' },
							{ name: 'Singapore (SG)', value: 'SG' },
							{ name: 'South Korea (KR)', value: 'KR' },
							{ name: 'Spain (ES)', value: 'ES' },
							{ name: 'Sweden (SE)', value: 'SE' },
							{ name: 'Switzerland (CH)', value: 'CH' },
							{ name: 'Taiwan (TW)', value: 'TW' },
							{ name: 'Thailand (TH)', value: 'TH' },
							{ name: 'Turkey (TR)', value: 'TR' },
							{ name: 'United Kingdom (GB)', value: 'GB' },
							{ name: 'United States (US)', value: 'US' },
						] as INodePropertyOptions[],
					},
					{
						displayName: 'Main Content Only',
						name: 'main_content_only',
						type: 'boolean',
						default: true,
						description:
							"Whether to keep only the page's main content and drop navigation, the site header, footer and sidebars. Turn off to convert the whole page.",
					},
					{
						displayName: 'Wait for Element Method',
						name: 'method',
						type: 'options',
						default: '',
						description:
							'Selector strategy to wait for a specific element before capturing HTML. Must be used together with "Wait for Element Value".',
						options: [
							{ name: 'None', value: '' },
							{ name: 'CSS', value: 'css' },
							{ name: 'XPath', value: 'xPath' },
							{ name: 'Class Name', value: 'className' },
							{ name: 'Tag Name', value: 'tagName' },
						] as INodePropertyOptions[],
					},
					{
						displayName: 'Wait for Element Value',
						name: 'value',
						type: 'string',
						default: '',
						description:
							'The selector string to wait for, interpreted according to the selected method. Returns once the element appears (20 second timeout).',
						displayOptions: {
							show: {
								method: ['css', 'xPath', 'className', 'tagName'],
							},
						},
					},
					{
						displayName: 'Parsed Data',
						name: 'parsed_data',
						type: 'boolean',
						default: false,
						description:
							'Whether to return structured JSON extracted from the page for supported domains instead of raw HTML',
					},
					{
						displayName: 'Browser Steps',
						name: 'steps',
						type: 'json',
						default: '',
						placeholder:
							'[{"action":"wait_for","selector":".main-content"},{"action":"click","selector":"#load-more"}]',
						description:
							'A JSON array of browser actions to run in a real browser after the page loads, before the HTML is captured. Supported actions: wait_for, wait_for_text, wait, click, type, select, press_key, scroll. Leave empty to skip. A failing step returns an HTTP 422 error describing which step failed.',
					},
					{
						displayName: 'List Elements',
						name: 'list_elements',
						type: 'boolean',
						default: false,
						description:
							'Whether to return structured JSON listing the elements found on the page (with a total count and per-element details) instead of raw HTML',
					},
				] as INodeProperties[]
			).map(webPageParameter),
			...pluginProperties,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				if (resource !== 'webPage') {
					const operation = this.getNodeParameter('operation', i) as string;
					const plugin = PLUGIN_OPERATIONS[`${resource}:${operation}`];
					if (!plugin) {
						throw new NodeOperationError(
							this.getNode(),
							`The operation '${operation}' is not supported for resource '${resource}'`,
							{ itemIndex: i },
						);
					}
					const body = await callPlugin.call(this, plugin, pluginQuery.call(this, plugin, i), i);
					for (const item of shapeItems.call(this, resultItems(plugin, body), plugin.shape, i)) {
						returnData.push({ json: item, pairedItem: i });
					}
					continue;
				}

				const operation = this.getNodeParameter('operation', i);
				if (operation === 'getImage') {
					returnData.push(await getImage.call(this, i));
					continue;
				}
				if (operation === 'getMarkdown') {
					returnData.push(await getMarkdown.call(this, i));
					continue;
				}

				const url = this.getNodeParameter('url', i) as string;
				const parsedData = this.getNodeParameter('parsed_data', i) as boolean;
				const listElements = this.getNodeParameter('list_elements', i) as boolean;

				const query = pageQuery.call(this, i);

				if (parsedData) {
					query.parsed_data = true;
				}

				if (listElements) {
					query.list_elements = true;
				}

				const options: IHttpRequestOptions = {
					method: 'POST',
					url: `${API_URL}/getPageSource`,
					qs: query,
					json: true,
					returnFullResponse: true,
					ignoreHttpStatusErrors: true,
				};

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'scrapeUnblockerApi',
					options,
				)) as IN8nHttpFullResponse;

				// A missing target page is a result, not a node failure: the page was
				// fetched and the call billed, and a retry returns the same answer.
				const gone = targetGoneStatus(response.statusCode, response.headers['x-origin-status']);
				if (gone !== null) {
					returnData.push({
						json: {
							url,
							pageNotFound: true,
							originStatus: gone,
							billed: true,
							message:
								`The target page does not exist: it answered HTTP ${gone}. This is the ` +
								"website's own answer, not a block or an API failure. The call was " +
								'billed, and retrying returns the same result.',
							body: response.body as JsonObject,
						},
						pairedItem: i,
					});
					continue;
				}

				if (response.statusCode >= 400) {
					const body =
						typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
					throw new NodeApiError(
						this.getNode(),
						{
							message: body,
							httpCode: String(response.statusCode),
						} as JsonObject,
						{ itemIndex: i, httpCode: String(response.statusCode) },
					);
				}

				returnData.push({ json: response.body as JsonObject, pairedItem: i });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: error.message }, pairedItem: i });
				} else {
					throw new NodeApiError(this.getNode(), error, { itemIndex: i });
				}
			}
		}
		return [returnData];
	}
}

/**
 * The `/getPageSource` query shared by Get Page Source and Get Markdown: the URL, the
 * country, the element to wait for and the browser steps.
 */
function pageQuery(this: IExecuteFunctions, itemIndex: number): Record<string, string | boolean> {
	const query: Record<string, string | boolean> = {
		url: this.getNodeParameter('url', itemIndex) as string,
	};
	const proxyCountry = this.getNodeParameter('proxy_country', itemIndex, '') as string;
	if (proxyCountry) {
		query.proxy_country = proxyCountry;
	}
	const method = this.getNodeParameter('method', itemIndex, '') as string;
	if (method) {
		query.method = method;
		const value = this.getNodeParameter('value', itemIndex, '') as string;
		if (value) {
			query.value = value;
		}
	}
	const steps = this.getNodeParameter('steps', itemIndex, '') as string;
	if (typeof steps === 'string' && steps.trim() !== '') {
		let parsedSteps: unknown;
		try {
			parsedSteps = JSON.parse(steps);
		} catch {
			throw new NodeOperationError(
				this.getNode(),
				'Browser Steps must be a valid JSON array of actions',
				{ itemIndex },
			);
		}
		if (!Array.isArray(parsedSteps)) {
			throw new NodeOperationError(this.getNode(), 'Browser Steps must be a JSON array of actions', {
				itemIndex,
			});
		}
		if (parsedSteps.length > 0) {
			query.steps = JSON.stringify(parsedSteps);
		}
	}
	return query;
}

/** The API's explanation in an error answer read as text: its JSON `detail`, or the text. */
function errorMessage(text: string): string {
	try {
		const parsed: unknown = JSON.parse(text);
		if (typeof parsed === 'object' && parsed !== null) {
			return apiMessage(parsed as IDataObject);
		}
	} catch {
		// Not JSON: the text itself is the explanation.
	}
	return apiMessage(text);
}

/**
 * Fetches one page through `/getPageSource?markdown=true` and returns `{ url, markdown }`.
 * The body is read as text, so a page whose Markdown happens to look like JSON stays text.
 * A missing page (the site's 404/410) is an item with the site's own page as Markdown.
 */
async function getMarkdown(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const qs = pageQuery.call(this, itemIndex);
	const url = qs.url as string;
	qs.markdown = true;
	qs.main_content_only = this.getNodeParameter('main_content_only', itemIndex, true) as boolean;
	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'scrapeUnblockerApi',
		{
			method: 'POST',
			url: `${API_URL}/getPageSource`,
			qs,
			encoding: 'text',
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		},
	)) as IN8nHttpFullResponse;
	const markdown = typeof response.body === 'string' ? response.body : String(response.body ?? '');
	const gone = targetGoneStatus(response.statusCode, response.headers?.['x-origin-status']);
	if (gone !== null) {
		return {
			json: {
				url,
				pageNotFound: true,
				originStatus: gone,
				billed: true,
				message:
					`The target page does not exist: it answered HTTP ${gone}. This is the ` +
					"website's own answer, not a block or an API failure. The call was " +
					'billed, and retrying returns the same result.',
				markdown,
			},
			pairedItem: itemIndex,
		};
	}
	if (response.statusCode >= 400) {
		const message = errorMessage(markdown);
		throw new NodeApiError(
			this.getNode(),
			{ message, httpCode: String(response.statusCode) } as JsonObject,
			{
				itemIndex,
				httpCode: String(response.statusCode),
				message,
				description: errorHint(response.statusCode),
			},
		);
	}
	return { json: { url, markdown }, pairedItem: itemIndex };
}

/**
 * Downloads one image through `/getImage` and returns it as binary data, in the
 * image's own format. A missing image (the host's 404/410) is an item, not an error.
 */
async function getImage(this: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData> {
	const url = this.getNodeParameter('url', itemIndex) as string;
	const proxyCountry = this.getNodeParameter('proxy_country', itemIndex, '') as string;
	const qs: Record<string, string> = { url };
	if (proxyCountry) {
		qs.proxy_country = proxyCountry;
	}
	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'scrapeUnblockerApi',
		{
			method: 'POST',
			url: `${API_URL}/getImage`,
			qs,
			encoding: 'arraybuffer',
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		},
	)) as IN8nHttpFullResponse;
	const body = Buffer.from(response.body as ArrayBuffer);
	const gone = targetGoneStatus(response.statusCode, response.headers?.['x-origin-status']);
	if (gone !== null && response.headers?.['x-origin-status'] !== undefined) {
		return {
			json: {
				url,
				imageNotFound: true,
				originStatus: gone,
				billed: true,
				message:
					`The image does not exist: its host answered HTTP ${gone}. This is the ` +
					"site's own answer, not a block or an API failure. The call was billed, " +
					'and retrying returns the same result.',
			},
			pairedItem: itemIndex,
		};
	}
	if (response.statusCode >= 400) {
		throw new NodeApiError(
			this.getNode(),
			{
				message: body.toString('utf8').slice(0, 500),
				httpCode: String(response.statusCode),
			} as JsonObject,
			{ itemIndex, httpCode: String(response.statusCode) },
		);
	}
	const mimeType =
		headerValue(response.headers?.['content-type']).split(';')[0].trim().toLowerCase() ||
		'application/octet-stream';
	const binary = await this.helpers.prepareBinaryData(body, imageFileName(url, mimeType), mimeType);
	return {
		json: { url, fileName: binary.fileName, mimeType: binary.mimeType, fileSize: binary.fileSize },
		binary: { data: binary },
		pairedItem: itemIndex,
	};
}
