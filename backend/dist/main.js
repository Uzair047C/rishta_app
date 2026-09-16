"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        // Reject rather than silently drop unknown fields — a typo'd key should
        // surface as an error, not as a silently ignored update.
        forbidNonWhitelisted: true,
        transform: true,
    }));
    // Lets the nightly quota cron finish and the pg pool drain on SIGTERM.
    app.enableShutdownHooks();
    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port);
    common_1.Logger.log(`Rishta API listening on :${port}`, 'Bootstrap');
}
void bootstrap();
//# sourceMappingURL=main.js.map