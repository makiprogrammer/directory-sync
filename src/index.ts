#!/usr/bin/env node
// This notes that this file is started with node executable.

import { Command } from "commander";

import analyseDirectories from "./analyseDirectories";
import syncDirectories from "./syncDirectories";

const program = new Command();
program.name("dirsync").description("CLI to syncing directories");

program
	.command("analyse")
	.alias("a")
	.alias("analyze")
	.description(
		"Analyse two directories. The results will be printed to the console or specified output file."
	)
	.argument("<dir1>", "first directory")
	.argument("<dir2>", "second directory")
	.option("-o, --output-file <file>", "where to write the output of the analysis in JSON format")
	.action(analyseDirectories);

program
	.command("synchronise")
	.alias("sync")
	.alias("synchronize")
	.description("Synchronises two directories. We recommend running `dirsync analyse` first.")
	.argument("<dir1>", "first directory")
	.argument("<dir2>", "second directory")
	.option("-f, --force", "asks no questions and syncs everything (not recommended)")
	.action(syncDirectories);

program.parse();
