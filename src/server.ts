import closeWithGrace from "close-with-grace";
import * as dotenv from "dotenv";

import Fastify from "fastify";

dotenv.config();

const app = Fastify({
  logger: true,
});

app.register(import("./app"));

const closeListeners = closeWithGrace({ delay: 500 }, async function (opts: any) {
  if (opts.err) {
    app.log.error(opts.err);
  }
  await app.close();
});

app.addHook("onClose", async (instance, done) => {
  closeListeners.uninstall();
  done();
});

app.listen(process.env.PORT || 8000, "127.0.0.1", (err: any) => {
  console.info(`Server is running at http://127.0.0.1:${process.env.PORT || 8000}`);

  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
