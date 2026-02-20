import { IAuthenticateGeneric, ICredentialType, INodeProperties, ICredentialTestRequest, Icon } from 'n8n-workflow';

export class ScrapeUnblockerApi implements ICredentialType {
	name = 'scrapeUnblockerApi';
	displayName = 'ScrapeUnblocker API';
	icon: Icon = 'file:scrapeunblocker.svg';
	documentationUrl = 'https://www.scrapeunblocker.com/documentation';
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
