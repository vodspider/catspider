import axios from "axios";
import https from "https";
import http from "http";
import CryptoJS from "crypto-js";

const _http = axios.create({
  timeout: 15 * 1000, //整体超时
  httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
  httpAgent: new http.Agent({ keepAlive: true }),
});

class Spider {
  constructor({ url, authorization }, meta) {
    this.baseUrl = url;
    this.headers = { authorization: authorization };
    this.meta = Object.assign(meta, {
      key: /^push/i.test(meta.key || "") ? "push" : meta.key,
      type: /^push/i.test(meta.key || "") ? 4 : 3,
    });
  }

  init() {
    return this.meta;
  }

  home(req) {
    const { filter } = req.body;
    return this.fetch({ filter });
  }

  category(req) {
    const { id, page, filter, filters } = req.body;
    const ext = CryptoJS.enc.Base64.stringify(
      CryptoJS.enc.Utf8.parse(JSON.stringify(filters))
    );
    return this.fetch({
      ac: "detail",
      t: id,
      pg: page || 1,
      filter: filter,
      ext: ext,
    });
  }

  detail(req) {
    const { id } = req.body;
    return this.fetch({ ac: "detail", ids: id });
  }

  async play(req) {
    const { flag, flags, id } = req.body;
    const ret = await this.fetch({
      play: id,
      flag: flag,
    });

    if (Array.isArray(ret.url) && /^代理/i.test(ret.url[0])) {
      const { address, port } = req.server.address();
      const uri = new URL(ret.url[1]);
      uri.hostname = address;
      uri.port = port;
      ret.url[1] = uri.toString();
    }
    return ret;
  }

  search(req) {
    const { page, quick, wd } = req.body;
    return this.fetch({
      wd: wd,
      pg: page || 1,
      quick: quick,
    });
  }

  async fetch(params) {
    const url = `${this.baseUrl}${this.meta.api}`;
    const res = await _http.get(url, {
      params: params,
      headers: this.headers,
    });
    return res.data;
  }

  get export() {
    return {
      meta: this.meta,
      api: async (f) => {
        f.post("/init", this.init.bind(this));
        f.post("/home", this.home.bind(this));
        f.post("/category", this.category.bind(this));
        f.post("/detail", this.detail.bind(this));
        f.post("/play", this.play.bind(this));

        if (this.meta.searchable) {
          f.post("/search", this.search.bind(this));
        }
        if (this.meta.type === 4) {
          f.post("/support", async () => true);
        }
      },
    };
  }
}

export default Spider;
