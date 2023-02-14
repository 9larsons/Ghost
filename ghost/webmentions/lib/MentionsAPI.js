const errors = require('@tryghost/errors');
const cheerio = require('cheerio');
const Mention = require('./Mention');

/**
 * @template Model
 * @typedef {object} Page<Model>
 * @prop {Model[]} data
 * @prop {object} meta
 * @prop {object} meta.pagination
 * @prop {number} meta.pagination.page - The current page
 * @prop {number} meta.pagination.pages - The total number of pages
 * @prop {number | 'all'} meta.pagination.limit - The limit of models per page
 * @prop {number} meta.pagination.total - The total number of models across all pages
 * @prop {number|null} meta.pagination.prev - The number of the previous page, or null if there isn't one
 * @prop {number|null} meta.pagination.next - The number of the next page, or null if there isn't one
 */

/**
 * @typedef {object} PaginatedOptions
 * @prop {string} [filter] A valid NQL string
 * @prop {string} [order]
 * @prop {number} page
 * @prop {number} limit
 */

/**
 * @typedef {object} NonPaginatedOptions
 * @prop {string} [filter] A valid NQL string
 * @prop {string} [order]
 * @prop {'all'} limit
 */

/**
 * @typedef {PaginatedOptions | NonPaginatedOptions} GetPageOptions
 */

/**
 * @typedef {object} IMentionRepository
 * @prop {(mention: Mention) => Promise<void>} save
 * @prop {(options: GetPageOptions) => Promise<Page<Mention>>} getPage
 * @prop {(source: URL, target: URL) => Promise<Mention>} getBySourceAndTarget
 */

/**
 * @typedef {object} ResourceResult
 * @prop {string | null} type
 * @prop {import('bson-objectid').default | null} id
 */

/**
 * @typedef {object} IResourceService
 * @prop {(url: URL) => Promise<ResourceResult>} getByURL
 */

/**
 * @typedef {object} IRoutingService
 * @prop {(url: URL) => Promise<boolean>} pageExists
 */

/**
 * @typedef {object} WebmentionMetadata
 * @prop {string} siteTitle
 * @prop {string} title
 * @prop {string} excerpt
 * @prop {string} author
 * @prop {URL} image
 * @prop {URL} favicon
 */

/**
 * @typedef {object} IWebmentionMetadata
 * @prop {(url: URL) => Promise<WebmentionMetadata>} fetch
 */

/**
 * @typedef {(url: string, config: Object) => Promise} IExternalRequest
 */

module.exports = class MentionsAPI {
    /** @type {IMentionRepository} */
    #repository;
    /** @type {IResourceService} */
    #resourceService;
    /** @type {IRoutingService} */
    #routingService;
    /** @type {IWebmentionMetadata} */
    #webmentionMetadata;
    /** @type {IExternalRequest} */
    #externalRequest;

    /**
     * @param {object} deps
     * @param {IMentionRepository} deps.repository
     * @param {IResourceService} deps.resourceService
     * @param {IRoutingService} deps.routingService
     * @param {IWebmentionMetadata} deps.webmentionMetadata
     * @param {IExternalRequest} deps.externalRequest
     */
    constructor(deps) {
        this.#repository = deps.repository;
        this.#resourceService = deps.resourceService;
        this.#routingService = deps.routingService;
        this.#webmentionMetadata = deps.webmentionMetadata;
        this.#externalRequest = deps.externalRequest;
    }

    /**
     * @param {object} options
     * @returns {Promise<Page<Mention>>}
     */
    async listMentions(options) {
        /** @type {GetPageOptions} */
        let pageOptions;

        if (options.limit === 'all') {
            pageOptions = {
                filter: options.filter,
                limit: options.limit,
                order: options.order
            };
        } else {
            pageOptions = {
                filter: options.filter,
                limit: options.limit,
                page: options.page,
                order: options.order
            };
        }

        const page = await this.#repository.getPage(pageOptions);

        return page;
    }

    /**
     * @param {object} webmention
     * @param {URL} webmention.source
     * @param {URL} webmention.target
     * @param {Object<string, any>} webmention.payload
     *
     * @returns {Promise<Mention>}
     */
    async processWebmention(webmention) {
        let mention = await this.#repository.getBySourceAndTarget(
            webmention.source,
            webmention.target
        );

        const targetExists = await this.#routingService.pageExists(webmention.target);

        if (!targetExists) {
            if (!mention) {
                throw new errors.BadRequestError({
                    message: `${webmention.target} is not a valid URL for this site.`
                });
            } else {
                mention.delete();
            }
        }

        const resourceInfo = await this.#resourceService.getByURL(webmention.target);

        let metadata;
        try {
            metadata = await this.#webmentionMetadata.fetch(webmention.source);
            if (mention) {
                mention.setSourceMetadata({
                    sourceTitle: metadata.title,
                    sourceSiteTitle: metadata.siteTitle,
                    sourceAuthor: metadata.author,
                    sourceExcerpt: metadata.excerpt,
                    sourceFavicon: metadata.favicon,
                    sourceFeaturedImage: metadata.image
                });
            }
        } catch (err) {
            if (!mention) {
                throw err;
            }
            mention.delete();
        }

        // TODO: right now we use the oembed service to pull the metadata and this call to verify the link, i.e. two calls
        //  we should probably refactor the metadata pull into one call that collects both the metadata
        //  via metascraper & parse the html to verify the link existence
        let verified;
        try {
            let response = await this.#externalRequest(webmention.source.href,{
                throwHttpErrors: false,
                followRedirects: true,
                maxRedirects: 10
            });
            // should not need to check for error codes because we have called to this url above
            verified = await this.verifyTargetInSource(response,webmention.target);
            if (mention) {
                mention.verify(verified);
            }
        } catch (err) {
            console.log(`Error verifying source of Webmention`,err);
        }

        if (!mention) {
            mention = await Mention.create({
                source: webmention.source,
                target: webmention.target,
                timestamp: new Date(),
                payload: webmention.payload,
                resourceId: resourceInfo.type === 'post' ? resourceInfo.id : null,
                sourceTitle: metadata.title,
                sourceSiteTitle: metadata.siteTitle,
                sourceAuthor: metadata.author,
                sourceExcerpt: metadata.excerpt,
                sourceFavicon: metadata.favicon,
                sourceFeaturedImage: metadata.image,
                verified: verified
            });
        }
        await this.#repository.save(mention);
        return mention;
    }

    /**
     * @param {object} response
     * @param {URL} target
     *
     * @returns {Promise<Boolean>}
     */
    async verifyTargetInSource({body},target) {
        const $ = cheerio.load(body);
        let hasTarget = $(`a[href="${target.href}"]`).length ? true : false;
        return hasTarget;
    }
};
