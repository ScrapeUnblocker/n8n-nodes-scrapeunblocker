import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	IHttpRequestOptions
} from 'n8n-workflow';

export class ScrapeUnblocker implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ScrapeUnblocker',
		name: 'scrapeUnblocker',
		icon: 'file:scrapeunblocker.svg',
		group: ['transform'],
		version: 1,
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
				description: 'The URL of the page you want to scrape or unblock',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const url = this.getNodeParameter('url', i) as string;
				// const credentials = await this.getCredentials('scrapeUnblockerApi');
				const options: IHttpRequestOptions = {
					method: 'POST',
					url: 'https://api.scrapeunblocker.com/getPageSource',
					qs: { url },
					json: true,
				};

				const responseData = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'scrapeUnblockerApi',
					options,
				);
				returnData.push({ json: responseData });

			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: error.message }, pairedItem: i });
				} else {
					throw error;
				}
			}
		}

		return [returnData];
	}
}