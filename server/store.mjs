import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { defaultProject } from "../shared/project.mjs";
export class Store {
  constructor(root) {
    this.root = root;
  }
  async init() {
    await Promise.all(
      ["runs", "exports"].map((d) =>
        mkdir(path.join(this.root, d), { recursive: true }),
      ),
    );
  }
  async read(file, fallback) {
    try {
      return JSON.parse(await readFile(path.join(this.root, file), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return fallback;
      throw e;
    }
  }
  async write(file, value) {
    const destination = path.join(this.root, file);
    const temp = destination + "." + randomUUID() + ".tmp";
    await writeFile(temp, JSON.stringify(value, null, 2));
    await rename(temp, destination);
    return value;
  }
  async project() {
    return this.read("project.json", structuredClone(defaultProject));
  }
  async list(kind) {
    const files = await readdir(path.join(this.root, kind));
    const entries = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => this.read(`${kind}/${f}`)),
    );
    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async recover() {
    for (const kind of ["runs", "exports"])
      for (const item of await this.list(kind))
        if (["queued", "running"].includes(item.status))
          await this.write(`${kind}/${item.id}.json`, {
            ...item,
            status: "failed",
            error:
              "The server restarted before this job finished. Please try again.",
          });
  }
}
