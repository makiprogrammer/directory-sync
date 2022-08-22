#!/usr/bin/env node
// This notes that this file is started with node executable.

import { Command } from "commander";

import analyseDirectories from "./analyseDirectories";
import syncDirectories from "./syncDirectories";
import { logWarning } from "./utils";

const program = new Command();
program.name("dirsync").description("CLI to syncing directories");

program
	.description("Synchronises two directories. We recommend running `dirsync --analyse` first.")
	.argument("<dir1>", "first directory")
	.argument("<dir2>", "second directory")
	.option(
		"-a, --analyse, --analyze, --no-sync",
		"Analyse two directories with no sync. The results will be printed to the console or specified output file specified in option --output-file."
	)
	.option("-o, --output-file <file>", "where to write the output of the analysis in JSON format")
	.option("-f, --force", "asks no questions and syncs everything (not recommended)")
	.action((dir1, dir2, options) => {
		if (options.analyse) return analyseDirectories(dir1, dir2, options);
		if (options.outputFile)
			logWarning("Specified output file has no effect when --analyse is not specified");
		syncDirectories(dir1, dir2, options);
	});

program.parse();
