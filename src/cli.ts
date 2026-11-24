#!/usr/bin/env node
import { writeNotice } from "./notice";

process.exitCode = writeNotice(process.stderr);
