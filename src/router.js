import alist from "./spider/pan/alist.js";
import _13bqg from "./spider/book/13bqg.js";
import copymanga from "./spider/book/copymanga.js";
import axios from "axios";
import Spider from "./spider/spider.js";
import ProxyPlayer from "./proxy.js";

const spiders = [alist, _13bqg, copymanga];
const spiderPrefix = "/spider";

/**
 * A function to initialize the router.
 *
 * @param {Object} fastify - The Fastify instance
 * @return {Promise<void>} - A Promise that resolves when the router is initialized
 */
export default async function router(fastify) {
  const { config } = fastify;

  const { url, authorization } = config.server;
  const data = (
    await axios.get(`${url}/config`, {
      timeout: 10 * 1000,
      headers: { authorization: authorization },
    })
  ).data;

  const result = [];
  (data || []).forEach((site) => {
    const spider = new Spider({ url, authorization }, site);
    const meta = Object.assign({}, spider.meta);
    meta.api = `/spider/${meta.key}/${meta.type}`;
    meta.key = `nodejs_${meta.key}`;

    fastify.register(spider.export.api, { prefix: meta.api });
    console.log("Register spider: " + meta.api);
    result.push(meta);
  });

  // register all spider router
  spiders.forEach((spider) => {
    const path = spiderPrefix + "/" + spider.meta.key + "/" + spider.meta.type;
    fastify.register(spider.api, { prefix: path });
    console.log("Register spider: " + path);
  });
  /**
   * @api {get} /check 检查
   */
  fastify.register(
    /**
     *
     * @param {import('fastify').FastifyInstance} fastify
     */
    async (fastify) => {
      fastify.get(
        "/check",
        /**
         * check api alive or not
         * @param {import('fastify').FastifyRequest} _request
         * @param {import('fastify').FastifyReply} reply
         */
        async function (_request, reply) {
          reply.send({ run: !fastify.stop });
        }
      );
      fastify.get(
        "/config",
        /**
         * get catopen format config
         * @param {import('fastify').FastifyRequest} _request
         * @param {import('fastify').FastifyReply} reply
         */
        async function (_request, reply) {
          const config = {
            video: {
              sites: [...result],
            },
            read: {
              sites: [],
            },
            comic: {
              sites: [],
            },
            music: {
              sites: [],
            },
            pan: {
              sites: [],
            },
            color: fastify.config.color || [],
          };
          spiders.forEach((spider) => {
            let meta = Object.assign({}, spider.meta);
            meta.api = spiderPrefix + "/" + meta.key + "/" + meta.type;
            meta.key = "nodejs_" + meta.key;
            const stype = spider.meta.type;
            if (stype < 10) {
              config.video.sites.push(meta);
            } else if (stype >= 10 && stype < 20) {
              config.read.sites.push(meta);
            } else if (stype >= 20 && stype < 30) {
              config.comic.sites.push(meta);
            } else if (stype >= 30 && stype < 40) {
              config.music.sites.push(meta);
            } else if (stype >= 40 && stype < 50) {
              config.pan.sites.push(meta);
            }
          });
          reply.send(config);
        }
      );

      fastify.get(
        "/proxy",
        /**
         * get catopen format config
         * @param {import('fastify').FastifyRequest} req
         * @param {import('fastify').FastifyReply} reply
         */
        (req, reply) => {
          let { thread, chunkSize, url } = req.query;
          const { headers } = req;

          if (!url) {
            return reply.code(400).send({
              msg: "url不能为空",
            });
          }

          const proxy = new ProxyPlayer(headers, {
            thread,
            chunkSize,
            url,
          });
          reply.raw.on("close", () => proxy.cancel());
          proxy
            .play(reply.raw)
            .catch((err) => {
              console.log(err);
              proxy.cancel();
            })
            .finally(() => reply.raw.end());
        }
      );
    }
  );
}
