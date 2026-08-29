import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
	NodeOperationError,
	NodeConnectionTypes,
	IHttpRequestOptions,
	INodePropertyOptions,
} from 'n8n-workflow';

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
		subtitle: '={{$parameter["url"]}}',
		description: 'Unblock and scrape any website using ScrapeUnblocker API',
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
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				placeholder: 'https://example.com',
				required: true,
				description: 'The URL of the webpage you want to fetch',
			},
			{
				displayName: 'Proxy Country',
				name: 'proxy_country',
				type: 'options',
				default: '',
				description: 'The country of the proxy to use. If not specified, a random proxy from a European country will be used.',
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
				displayName: 'Wait for Element Method',
				name: 'method',
				type: 'options',
				default: '',
				description: 'Selector strategy to wait for a specific element before capturing HTML. Must be used together with "Wait for Element Value".',
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
				description: 'The selector string to wait for, interpreted according to the selected method. Returns once the element appears (20 second timeout).',
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
				description: 'Whether to return structured JSON extracted from the page for supported domains instead of raw HTML',
			},
			{
				displayName: 'Browser Steps',
				name: 'steps',
				type: 'json',
				default: '',
				placeholder: '[{"action":"wait_for","selector":".main-content"},{"action":"click","selector":"#load-more"}]',
				description: 'A JSON array of browser actions to run in a real browser after the page loads, before the HTML is captured. Supported actions: wait_for, wait_for_text, wait, click, type, select, press_key, scroll. Leave empty to skip. A failing step returns an HTTP 422 error describing which step failed.',
			},
			{
				displayName: 'List Elements',
				name: 'list_elements',
				type: 'boolean',
				default: false,
				description: 'Whether to return structured JSON listing the elements found on the page (with a total count and per-element details) instead of raw HTML',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const url = this.getNodeParameter('url', i) as string;
				const proxyCountry = this.getNodeParameter('proxy_country', i) as string;
				const method = this.getNodeParameter('method', i) as string;
				const parsedData = this.getNodeParameter('parsed_data', i) as boolean;
				const listElements = this.getNodeParameter('list_elements', i) as boolean;
				const steps = this.getNodeParameter('steps', i, '') as string;

				const query: Record<string, string | boolean> = {
					url,
				};

				if (proxyCountry) {
					query.proxy_country = proxyCountry;
				}

				if (method) {
					query.method = method;
					const value = this.getNodeParameter('value', i, '') as string;
					if (value) {
						query.value = value;
					}
				}

				if (parsedData) {
					query.parsed_data = true;
				}

				if (listElements) {
					query.list_elements = true;
				}

				if (typeof steps === 'string' && steps.trim() !== '') {
					let parsedSteps: unknown;
					try {
						parsedSteps = JSON.parse(steps);
					} catch {
						throw new NodeOperationError(
							this.getNode(),
							'Browser Steps must be a valid JSON array of actions',
							{ itemIndex: i },
						);
					}
					if (!Array.isArray(parsedSteps)) {
						throw new NodeOperationError(
							this.getNode(),
							'Browser Steps must be a JSON array of actions',
							{ itemIndex: i },
						);
					}
					if (parsedSteps.length > 0) {
						query.steps = JSON.stringify(parsedSteps);
					}
				}

				const options: IHttpRequestOptions = {
					method: 'POST',
					url: 'https://api.scrapeunblocker.com/getPageSource',
					qs: query,
					json: true,
				};

				const responseData = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'scrapeUnblockerApi',
					options,
				);
				returnData.push({ json: responseData, pairedItem: i });
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