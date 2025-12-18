import axios, { CanceledError } from "axios";
import https from "https";
import http from "http";

export default class ProxyPlayer {
  constructor(headers, { thread, chunkSize, url }) {
    this._thread = Math.min(10, parseInt(thread || "10"));
    this._chunkSize = parseInt(chunkSize || "256") * 1024;
    this._url = url;

    const h = {};
    if (headers["user-agent"]) h["user-agent"] = headers["user-agent"];
    if (headers.cookie) h["cookie"] = headers.cookie;
    if (headers.referer) h["referer"] = headers.referer;

    this._controller = new AbortController();
    this._http = axios.create({
      timeout: 15 * 1000, //整体超时
      headers: h,
      responseType: "arraybuffer",
      signal: this._controller.signal,
      httpsAgent: new https.Agent({
        keepAlive: true,
        rejectUnauthorized: false,
      }),
      httpAgent: new http.Agent({ keepAlive: true }),
    });

    const { start, end } = this.parseRange(headers.range || ""); //range
    this._start = start;
    this._end = end;
  }

  async play(stream) {
    const { s, e } = await this.downloadFirst(stream);
    const fileSize = e + 1;

    for (
      let start = s;
      start < fileSize;
      start += this._chunkSize * this._thread
    ) {
      const promises = [];
      for (let i = 0; i < this._thread; i++) {
        const chunkStart = start + i * this._chunkSize;
        const chunkEnd = Math.min(chunkStart + this._chunkSize, fileSize);
        if (chunkStart >= fileSize) break;
        promises.push(this.downloadChunk(chunkStart, chunkEnd, i));
      }

      let chunks;
      try {
        chunks = await Promise.all(promises);
      } catch (err) {
        if (err instanceof CanceledError) {
          console.log(`[${this._start}]提前结束下载`);
          return;
        }
        throw err;
      }

      chunks.forEach((res) => {
        stream.write(res.data);
      });
    }
  }

  async downloadFirst(stream) {
    let start = this._start;
    let end = start + Math.min((this._end || 99) + 1, this._chunkSize);

    const res = await this.downloadChunk(start, end, 0, 1);
    const match = res.headers["content-range"].match(
      /bytes\s+(\d+)-(\d+)\/(\d+)/i
    );
    const totalLength = parseInt(match[3]); //文件总大小
    end = this._end ? this._end : totalLength - 1;

    const headers = res.headers;
    headers["content-range"] = `bytes ${start}-${end}/${totalLength}`;
    delete headers["content-length"];

    const chunk = res.data;
    stream.writeHead(res.status, headers);
    stream.write(chunk);

    return { s: start + chunk.length, e: end };
  }

  async downloadChunk(start, end, i, retryCount = 3) {
    try {
      const res = await this._http.get(this._url, {
        headers: {
          range: `bytes=${start}-${end - 1}`,
        },
      });
      console.log(
        `[${this._start}] i=${i ?? " "} status: ${
          res.status
        } start: ${start} end: ${end - 1}`
      );
      return res;
    } catch (error) {
      if (retryCount > 0) {
        console.log(`请求失败，剩余重试次数：${retryCount}，延迟3秒后重试...`);
        await new Promise((resolve) => setTimeout(resolve, 3000)); // 延迟3秒
        return this.downloadChunk(start, end, i, retryCount - 1); // 递归调用，减少重试次数
      } else {
        console.error("请求失败，已达到最大重试次数");
        throw error; // 抛出错误，表示请求失败
      }
    }
  }

  parseRange(_range) {
    const match = _range.match(/bytes=(\d+)-(\d*)/i);
    let start = 0;
    let end = undefined;
    if (match) {
      const [_, start_, end_] = match;
      start = parseInt(start_);
      end = end_ ? parseInt(end_) : undefined;
    }
    return { start, end };
  }

  cancel() {
    this._controller.abort();
  }
}
