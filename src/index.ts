#!/usr/bin/env node
// This notes that this file is started with node executable.

import { Command } from "commander";

import analyseDirectories from "./analyseDirectories";

const program = new Command();
program.name("dirsync").description("CLI to syncing directories");

program
	.command("a")
	.description("Analyze two directories. The results will be printed to the console.")
	.argument("<dir1>", "first directory")
	.argument("<dir2>", "second directory")
	.option(
		"-d, --depth <depth>",
		"maximum depth of subdirectories to analyse (default to 10), -1 for unlimited",
		"10"
	)
	// .option("-o, --output-file <file>", "output file")
	.action(analyseDirectories);

program.parse();
