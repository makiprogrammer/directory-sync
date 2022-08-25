#!/usr/bin/env node
// This notes that this file is started with node executable.

import { Command } from "commander";

import syncDirectories from "./syncDirectories";

const program = new Command();
program
	.name("dirsync")
	.description("Synchronises two or more directories.")
	.option("-f, --force", "asks no questions and syncs everything (not recommended)")
	.action((options, command) => {
		syncDirectories(options, command.args);
	});

program.parse();
