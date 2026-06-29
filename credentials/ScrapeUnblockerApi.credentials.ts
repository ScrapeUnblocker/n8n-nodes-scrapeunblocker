import { IAuthenticateGeneric, ICredentialType, INodeProperties, ICredentialTestRequest, Icon } from 'n8n-workflow';

export class ScrapeUnblockerApi implements ICredentialType {
	name = 'scrapeUnblockerApi';
	displayName = 'ScrapeUnblocker API';
	icon: Icon = {
		light: 'file:scrapeunblocker.svg',
		dark: 'file:scrapeunblocker.dark.svg',
	};
	documentationUrl = 'https://developers.scrapeunblocker.com/introduction';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'The API key for your ScrapeUnblocker account',
		},
		{
			displayName:
				'Get your API Key here: <a href="https://www.scrapeunblocker.com/pricing" target="_blank">https://www.scrapeunblocker.com/pricing</a>',
			name: 'pricingNotice',
			type: 'notice',
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-scrapeunblocker-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			url: 'https://api.scrapeunblocker.com/getPageSource',
			qs: {
				url: 'https://www.google.com',
			},
		},
	};
}
