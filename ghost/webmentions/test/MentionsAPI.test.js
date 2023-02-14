const assert = require('assert');
const ObjectID = require('bson-objectid');
const Mention = require('../lib/Mention');
const MentionsAPI = require('../lib/MentionsAPI');
const InMemoryMentionRepository = require('../lib/InMemoryMentionRepository');
const got = require('got');
const sinon = require('sinon');
const nock = require('nock');

const mockRoutingService = {
    async pageExists() {
        return true;
    }
};
const mockResourceService = {
    async getByURL() {
        return {
            type: null,
            id: null
        };
    }
};
const mockWebmentionMetadata = {
    async fetch() {
        return {
            siteTitle: 'Clickbait News',
            title: 'This egg breakfast will make you cry',
            excerpt: 'How many times have you woken up and almost cancelled your church plans? Well this breakfast is about to change everything, a hearty, faith restoring egg dish that will get your tastebuds in a twist.',
            author: 'Dr Egg Man',
            image: new URL('https://unsplash.com/photos/QAND9huzD04'),
            favicon: new URL('https://ghost.org/favicon.ico')
        };
    }
};

function addMinutes(date, minutes) {
    date.setMinutes(date.getMinutes() + minutes);
  
    return date;
}

describe('MentionsAPI', function () {
    before(function () {
        nock.disableNetConnect();
    });
    
    beforeEach(function () {
        nock('https://source.com').persist().get('/').reply(200);
        nock('https://diff-source.com').persist().get('/').reply(200);
        nock('https://source2.com').persist().get('/').reply(200);
        nock('https://target.com').persist().get('/').reply(200);
    });

    afterEach(function () {
        sinon.restore();
        nock.cleanAll();
    });

    after(function () {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('Can list paginated mentions', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: mockResourceService,
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });

        const mention = await api.processWebmention({
            source: new URL('https://source.com'),
            target: new URL('https://target.com'),
            payload: {}
        });

        assert(mention instanceof Mention);

        const page = await api.listMentions({
            limit: 1,
            page: 1
        });

        assert.equal(page.data[0].id, mention.id);
    });

    it('Can list all mentions', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: mockResourceService,
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });

        const mention = await api.processWebmention({
            source: new URL('https://source.com'),
            target: new URL('https://target.com'),
            payload: {}
        });

        assert(mention instanceof Mention);

        const page = await api.listMentions({
            limit: 'all'
        });

        assert.equal(page.data[0].id, mention.id);
    });

    it('Can list filtered mentions', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: mockResourceService,
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });

        const mentionOne = await api.processWebmention({
            source: new URL('https://diff-source.com'),
            target: new URL('https://target.com'),
            payload: {}
        });
        const mentionTwo = await api.processWebmention({
            source: new URL('https://source.com'),
            target: new URL('https://target.com'),
            payload: {}
        });

        assert(mentionOne instanceof Mention);
        assert(mentionTwo instanceof Mention);

        const page = await api.listMentions({
            filter: 'source.host:source.com',
            limit: 'all'
        });

        assert(page.meta.pagination.total === 1);
        assert(page.data[0].id === mentionTwo.id);
    });

    it('Can list mentions in descending order', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: mockResourceService,
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });

        const mentionOne = await api.processWebmention({
            source: new URL('https://source.com'),
            target: new URL('https://target.com'),
            payload: {}
        });

        sinon.useFakeTimers(addMinutes(new Date(), 10).getTime());

        const mentionTwo = await api.processWebmention({
            source: new URL('https://source2.com'),
            target: new URL('https://target.com'),
            payload: {}
        });

        assert(mentionOne instanceof Mention);
        assert(mentionTwo instanceof Mention);

        const page = await api.listMentions({
            limit: 'all',
            order: 'created_at desc'
        });

        assert(page.meta.pagination.total === 2);
        assert(page.data[0].id === mentionTwo.id, 'First mention should be the second one in descending order');
        assert(page.data[1].id === mentionOne.id, 'Second mention should be the first one in descending order');
    });

    it('Can list mentions in ascending order', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: mockResourceService,
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });

        const mentionOne = await api.processWebmention({
            source: new URL('https://source.com'),
            target: new URL('https://target.com'),
            payload: {}
        });

        sinon.useFakeTimers(addMinutes(new Date(), 10).getTime());

        const mentionTwo = await api.processWebmention({
            source: new URL('https://source2.com'),
            target: new URL('https://target.com'),
            payload: {}
        });

        assert(mentionOne instanceof Mention);
        assert(mentionTwo instanceof Mention);

        const page = await api.listMentions({
            limit: 'all',
            order: 'created_at asc'
        });

        assert(page.meta.pagination.total === 2);
        assert(page.data[0].id === mentionOne.id, 'First mention should be the first one in ascending order');
        assert(page.data[1].id === mentionTwo.id, 'Second mention should be the second one in ascending order');
    });

    it('Can handle updating mentions', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: mockResourceService,
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });

        const mentionOne = await api.processWebmention({
            source: new URL('https://source.com'),
            target: new URL('https://target.com'),
            payload: {}
        });

        const mentionTwo = await api.processWebmention({
            source: new URL('https://source.com'),
            target: new URL('https://target.com'),
            payload: {
                new: 'info'
            }
        });

        assert(mentionOne.id === mentionTwo.id);

        const page = await api.listMentions({
            limit: 'all'
        });

        assert(page.meta.pagination.total === 1);
        assert(page.data[0].id === mentionOne.id);
    });

    it('Will error if the target page does not exist', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: {
                async pageExists() {
                    return false;
                }
            },
            resourceService: mockResourceService,
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });

        let errored = false;
        try {
            await api.processWebmention({
                source: new URL('https://source.com'),
                target: new URL('https://target.com'),
                payload: {}
            });
        } catch (err) {
            errored = true;
        } finally {
            assert(errored);
        }
    });

    it('Will error if the source page does not exist', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: mockResourceService,
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });
        let source = new URL('https://source.com');
        nock(source)
            .get('/')
            .reply(404);

        let errored;
        try {
            await api.processWebmention({
                source: source,
                target: new URL('https://target.com'),
                payload: {}
            });
        } catch (err) {
            errored = true;
        } finally {
            assert(errored);
        }
    });

    it('Will only store resource if if the resource type is post', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: {
                async getByURL() {
                    return {
                        type: 'post',
                        id: new ObjectID
                    };
                }
            },
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });

        const mention = await api.processWebmention({
            source: new URL('https://source.com'),
            target: new URL('https://target.com'),
            payload: {}
        });

        assert(mention instanceof Mention);

        const page = await api.listMentions({
            limit: 'all'
        });

        assert.equal(page.data[0].id, mention.id);
    });

    it('Will delete an existing mention if the target page does not exist', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: {
                pageExists: sinon.stub().onFirstCall().resolves(true).onSecondCall().resolves(false)
            },
            resourceService: {
                async getByURL() {
                    return {
                        type: 'post',
                        id: new ObjectID
                    };
                }
            },
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });

        checkFirstMention: {
            const mention = await api.processWebmention({
                source: new URL('https://source.com'),
                target: new URL('https://target.com'),
                payload: {}
            });

            const page = await api.listMentions({
                limit: 'all'
            });

            assert.equal(page.data[0].id, mention.id);
            break checkFirstMention;
        }

        checkMentionDeleted: {
            await api.processWebmention({
                source: new URL('https://source.com'),
                target: new URL('https://target.com'),
                payload: {}
            });

            const page = await api.listMentions({
                limit: 'all'
            });

            assert.equal(page.data.length, 0);
            break checkMentionDeleted;
        }
    });

    it('Will delete an existing mention if the source page does not exist', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: {
                async getByURL() {
                    return {
                        type: 'post',
                        id: new ObjectID
                    };
                }
            },
            webmentionMetadata: {
                fetch: sinon.stub()
                    .onFirstCall().resolves(mockWebmentionMetadata.fetch())
                    .onSecondCall().rejects()
            },
            externalRequest: got
        });

        checkFirstMention: {
            const mention = await api.processWebmention({
                source: new URL('https://source.com'),
                target: new URL('https://target.com'),
                payload: {}
            });

            const page = await api.listMentions({
                limit: 'all'
            });

            assert.equal(page.data[0].id, mention.id);
            break checkFirstMention;
        }

        checkMentionDeleted: {
            await api.processWebmention({
                source: new URL('https://source.com'),
                target: new URL('https://target.com'),
                payload: {}
            });

            const page = await api.listMentions({
                limit: 'all'
            });

            assert.equal(page.data.length, 0);
            break checkMentionDeleted;
        }
    });

    it('Will throw for new mentions if the source page is not found', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: {
                async getByURL() {
                    return {
                        type: 'post',
                        id: new ObjectID
                    };
                }
            },
            webmentionMetadata: {
                fetch: sinon.stub().rejects(new Error(''))
            },
            externalRequest: got
        });

        let error = null;
        try {
            await api.processWebmention({
                source: new URL('https://source.com'),
                target: new URL('https://target.com'),
                payload: {}
            });
        } catch (err) {
            error = err;
        } finally {
            assert(error);
        }
    });

    it('Can verify a mention when the source has the target', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: mockResourceService,
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });
        let source = new URL('https://source.com');
        let target = new URL('https://target.com');
        let sourceHtml = `<html><body>Check out this <a href="${target.href}">cool Ghost site</a></body></html>`;
        nock(source.href)
            .get('/')
            .reply(200, sourceHtml);

        await api.processWebmention({
            source: source,
            target: target,
            payload: {}
        });
        const page = await api.listMentions({
            limit: 'all'
        });
        assert.equal(page.data[0].verified,true);
    });   

    it('Does not verify a mention when the source does not have the target', async function () {
        const repository = new InMemoryMentionRepository();
        const api = new MentionsAPI({
            repository,
            routingService: mockRoutingService,
            resourceService: mockResourceService,
            webmentionMetadata: mockWebmentionMetadata,
            externalRequest: got
        });
        let source = new URL('https://source.com');
        let target = new URL('https://target.com');
        let sourceHtml = `<html><body>Check out this <a href="http://someothersite.com">cool Ghost site</a></body></html>`;
        nock(source.href)
            .get('/')
            .reply(200, sourceHtml);

        await api.processWebmention({
            source: source,
            target: target,
            payload: {}
        });
        const page = await api.listMentions({
            limit: 'all'
        });
        assert.equal(page.data[0].verified,false);
    });   

    describe('verifyTargetInSource', function () {
        it('Returns true if the target href is in the html body', async function () {
            const repository = new InMemoryMentionRepository();
            const api = new MentionsAPI({
                repository,
                routingService: mockRoutingService,
                resourceService: mockResourceService,
                webmentionMetadata: mockWebmentionMetadata,
                externalRequest: got
            });
            let target = new URL('https://www.ghostsite.com/');
            let verified = await api.verifyTargetInSource({body: `<html><body><a href="${target.href}"></body></html>`},target);
            assert.equal(verified,true);
        });
        it('Returns false if the target href is not in the html body', async function () {
            const repository = new InMemoryMentionRepository();
            const api = new MentionsAPI({
                repository,
                routingService: mockRoutingService,
                resourceService: mockResourceService,
                webmentionMetadata: mockWebmentionMetadata,
                externalRequest: got
            });
            let target = new URL('https://www.ghostsite.com/');
            let verified = await api.verifyTargetInSource({body: `<html><body><a href="https://someothersite.com/"></body></html>`},target);
            assert.equal(verified,false);
        });
    });
});
