import path from "node:path";
import { randomUUID } from "node:crypto";
import { bold, cyan, magenta } from "chalk";
import fse from "fs-extra";
const { version } = require("../package.json");

import getDifferences, { Folder } from "./diffs";
import { askYesOrNo, groupByValue, logError, logGreen, logWarning } from "./utils";

interface ChildDirectory {
	name: string;
	ignoreFiles: string[];
	ignoreFolders: string[];
	subDirs: ChildDirectory[];
}

interface RootDirectory extends ChildDirectory {
	uuid: string;
	// TODO: maybe add presets for local drives, external backup drives, etc.
	// TODO: ... and from that derive default behaviour
}

interface DirsyncConfigFile {
	lastSyncDate: string;
	dirsyncVersion: string;
	dir1: RootDirectory;
	dir2: RootDirectory;
}

interface Options {
	force?: boolean;
}

function errorChecking(dir1: string, dir2: string, options: Options) {
	const errors = [];
	if (!fse.existsSync(dir1)) errors.push(`Directory "${dir1}" does not exist.`);
	if (!fse.existsSync(dir2)) errors.push(`Directory "${dir2}" does not exist.`);
	errors.forEach(logError);
	return errors;
}

async function copyFiles(
	fromFolder: Folder,
	toFolder: Folder,
	questionColor: (str: string) => string,
	sign: string
) {
	const ignored: string[] = []; // list of files that user refused to copy
	for (const { value: extension, items } of groupByValue(
		[...fromFolder.filesOnlyHere],
		path.extname
	))
		if (items.length > 10) {
			if (
				await askYesOrNo(
					questionColor(
						` ${sign} ${fromFolder.path}: total of ${items.length} ${bold(
							extension
						)} files (y/n) `
					)
				)
			)
				items.forEach(item =>
					fse.copyFile(path.join(fromFolder.path, item), path.join(toFolder.path, item))
				);
			else ignored.push(...items);
		} else
			for (const item of items)
				if (
					await askYesOrNo(
						questionColor(` ${sign} ${path.join(fromFolder.path, bold(item))} (y/n) `)
					)
				)
					fse.copyFile(path.join(fromFolder.path, item), path.join(toFolder.path, item));
				else ignored.push(item);
	return ignored;
}

async function copyFolders(
	fromFolder: Folder,
	toFolder: Folder,
	questionColor: (str: string) => string,
	sign: string
) {
	const ignored: string[] = []; // folders that user refused to copy
	for (const item of fromFolder.foldersOnlyHere)
		if (
			await askYesOrNo(
				questionColor(` ${sign} ${path.join(fromFolder.path, bold(item))} (y/n) `)
			)
		)
			fse.copySync(path.join(fromFolder.path, item), path.join(toFolder.path, item));
		else ignored.push(item);
	return ignored;
}

async function syncEverythingWithQuestions([dir1, dir2]: [Folder, Folder]) {
	// from dir1 to dir2
	dir1.ignoreFiles = await copyFiles(dir1, dir2, cyan, "dir2 <=");
	dir1.ignoreFolders = await copyFolders(dir1, dir2, cyan, "dir2 <=");
	// from dir2 to dir1
	dir2.ignoreFiles = await copyFiles(dir2, dir1, magenta, "dir1 <=");
	dir2.ignoreFolders = await copyFolders(dir2, dir1, magenta, "dir1 <=");

	// recursively sync common subdirectories
	for (const i in dir1.subDirs)
		await syncEverythingWithQuestions([dir1.subDirs[i], dir2.subDirs[i]]);
}

function finaliseFolderOutput(folder: Folder): ChildDirectory {
	return {
		name: folder.name,
		ignoreFiles: folder.ignoreFiles || [],
		ignoreFolders: folder.ignoreFolders || [],
		subDirs: folder.subDirs.map(finaliseFolderOutput),
	};
}

export default async function syncDirectories(dir1: string, dir2: string, options: Options) {
	if (errorChecking(dir1, dir2, options).length) return;
	if (options.force) return logError("Force option is not yet implemented.");

	logGreen("Analysing...");
	let diffs = getDifferences(dir1, dir2);
	if (diffs[0].name !== diffs[1].name)
		logWarning(`Root folder names differ: "${diffs[0].name}" and "${diffs[1].name}"`);

	// TODO // logGreen("No differences found.");

	await syncEverythingWithQuestions(diffs);

	// output result to a file
	const output: DirsyncConfigFile = {
		dirsyncVersion: version,
		lastSyncDate: new Date().toISOString(),
		dir1: { uuid: randomUUID(), ...finaliseFolderOutput(diffs[0]) },
		dir2: { uuid: randomUUID(), ...finaliseFolderOutput(diffs[1]) },
	};
	// write a copies to each directory
	fse.writeFileSync(path.join(dir1, "dirsync.config.json"), JSON.stringify(output));
	fse.writeFileSync(path.join(dir2, "dirsync.config.json"), JSON.stringify(output));
}
