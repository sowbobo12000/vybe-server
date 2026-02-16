import { config } from './config';
import { buildApp } from './app';

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Server running at http://${config.HOST}:${config.PORT}`);
    app.log.info(`API prefix: ${config.API_PREFIX}`);
    app.log.info(`Environment: ${config.NODE_ENV}`);
  } catch (err) {
    app.log.fatal(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    });
  }
}

main();
