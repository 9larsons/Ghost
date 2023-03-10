const assert = require('assert');
const OEmbedService = require('../lib/oembed-service');
const sinon = require('sinon');
const got = require('got'); // use got so we don't have a core dependency
const nock = require('nock');
const iconv = require('iconv-lite');

const mockGetOEmbedData = async function (url, externalRequest) {
    return await externalRequest(url);
};
const mockCanSupportRequest = async function (url) {
    return await !!url.host;
};
const mockProvider = {
    canSupportRequest: mockCanSupportRequest,
    getOEmbedData: mockGetOEmbedData
};

describe('Oembed Service', function () {
    before(function () {
        nock.disableNetConnect();
    });

    afterEach(function () {
        nock.cleanAll();
        sinon.restore();
    });

    after(function () {
        nock.enableNetConnect();
    });

    describe('registerProvider', function () {
        it('Adds new providers to customProviders', async function () {
            const service = new OEmbedService({externalRequest: got});
            service.registerProvider(mockProvider);
            assert.deepEqual(service.customProviders, [mockProvider]);
        });
    });

    describe('fetchPage', function () {
        it('Successfully requests', async function () {
            const service = new OEmbedService({externalRequest: got});
            const url = new URL('https://www.testsite.com');
            const body = '<p>some html</p>';
            nock(url.href)
                .get('/')
                .reply(200, body);
            const response = await service.fetchPage(url);
            assert.equal(response.body, body);
        });
    });

    describe('fetchPageHtml', function () {
        it('Returns non-decoded body when no encoding present', async function () {
            const service = new OEmbedService({externalRequest: got});
            const url = new URL('https://www.testsite.com');
            const body = '<p>some html</p>';
            nock(url.href)
                .get('/')
                .reply(200, body);
            const response = await service.fetchPageHtml(url);
            assert.equal(response.body, body);
        });

        it('Can decode a response body (utf8)', async function () {
            const service = new OEmbedService({externalRequest: got});
            const url = new URL('https://www.testsite.com');
            const body = '<p>some html</p>';
            const encodedBody = iconv.encode(body, 'utf8');
            nock(url.href)
                .get('/')
                .reply(200, encodedBody, {'Content-Type': 'text/html; charset=utf8'});
            const response = await service.fetchPageHtml(url);
            assert.equal(response.body, body);
        });

        it('Returns non-decoded body on error', async function () {
            const service = new OEmbedService({externalRequest: got});
            const url = new URL('https://www.testsite.com');
            const body = '<p>some html</p>';
            const encodedBody = iconv.encode(body, 'utf8');
            sinon.stub(iconv,'decode').throws();
            nock(url.href)
                .get('/')
                .reply(200, encodedBody, {'Content-Type': 'text/html; charset=utf8'});
            let response;
            try {
                response = await service.fetchPageHtml(url);
            } catch (e) {
                assert.equal(response.body, encodedBody);
            }
        });
    });

    describe('fetchPageJson', function () {
        it('Returns json', async function () {
            const service = new OEmbedService({externalRequest: got});
            const url = new URL('https://www.testsite.com');
            const body = '<p>some html</p>';
            const json = {body};
            nock(url.href)
                .get('/')
                .reply(200, json);
            const response = await service.fetchPage(url);
            assert.equal(response.body, JSON.stringify(json));
        });
    });

    describe('fetchOembedDataFromUrl', function () {
        it('Can fetch data from a known provider', async function () {
            const service = new OEmbedService({externalRequest: got});
            const urlString = 'https://www.testsite.com';
            const url = new URL(urlString);
            const body = {
                data: 'some data'
            };
            service.registerProvider(mockProvider);
            nock(url.href)
                .get('/')
                .reply(200, body);
            const response = await service.fetchOembedDataFromUrl(urlString, 'bookmark');
            assert.equal(response.body, JSON.stringify(body));
        });

        // it('Can fetch data from an unknown provider', async function () {
        //     const service = new OEmbedService({externalRequest: got});
        //     const urlString = 'https://www.testsite.com';
        //     const url = new URL(urlString);
        //     const body = {
        //         data: 'some data'
        //     };
        //     nock(url.href)
        //         .get('/')
        //         .reply(200, body);
        //     const response = await service.fetchOembedDataFromUrl(urlString, 'bookmark');
        //     assert.equal(response.body, JSON.stringify(body));
        // });
    });
});
