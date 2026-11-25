#!/usr/bin/env node
import { main } from "./server";

const packageJson: { version: string } = require("../package.json");

main({ argv: process.argv.slice(2), version: packageJson.version });
