import { bold, cyan, magenta } from "chalk";
import fse from "fs-extra";
import path from "path";

import { getFolder, compareFolders, Folder } from "./folders";
import { askYesOrNo, groupByValue, isNonEmptyDiff, logError, logGreen, logWarning } from "./utils";

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

async function copyFile(
	files: Set<string>,
	fromFolder: Folder,
	toFolder: Folder,
	questionColor: (str: string) => string,
	sign: string
) {
	for (const { value: extension, items } of groupByValue([...files], path.extname)) {
		if (
			items.length > 10 &&
			(await askYesOrNo(
				questionColor(
					` ${sign} ${fromFolder.path}: total of ${items.length} ${bold(
						extension
					)} files (y/n) `
				)
			))
		)
			items.forEach(item =>
				fse.copyFile(path.join(fromFolder.path, item), path.join(toFolder.path, item))
			);
		else
			for (const item of items)
				if (
					await askYesOrNo(
						questionColor(` ${sign} ${path.join(fromFolder.path, bold(item))} (y/n) `)
					)
				)
					fse.copyFile(path.join(fromFolder.path, item), path.join(toFolder.path, item));
	}
}

async function copyFolder(
	folders: Set<string>,
	fromFolder: Folder,
	toFolder: Folder,
	questionColor: (str: string) => string,
	sign: string
) {
	for (const item of folders)
		if (
			await askYesOrNo(
				questionColor(` ${sign} ${path.join(fromFolder.path, bold(item))} (y/n) `)
			)
		)
			fse.copySync(path.join(fromFolder.path, item), path.join(toFolder.path, item));
}

export default async function syncDirectories(dir1: string, dir2: string, options: Options) {
	if (errorChecking(dir1, dir2, options).length) return;

	logGreen("Analysing...");
	// get sub-directories and files
	const folder1 = getFolder(dir1);
	const folder2 = getFolder(dir2);

	// compare sub-directories and files
	const diffs = compareFolders(folder1, folder2).filter(isNonEmptyDiff);
	if (!diffs.length) return logGreen("No differences found.");
	if (folder1.name !== folder2.name)
		logWarning(`Root folder names differ: "${folder1.name}" and "${folder2.name}"`);

	if (options.force) {
		// TODO
	} else {
		for (const { folder1, folder2, filesIn1, filesIn2, foldersIn1, foldersIn2 } of diffs) {
			// files exclusive to folder1
			await copyFile(filesIn1, folder1, folder2, cyan, "dir2 <=");
			// files exclusive to folder2
			await copyFile(filesIn2, folder2, folder1, cyan, "dir1 <=");

			// folders exclusive to folder1
			await copyFolder(foldersIn1, folder1, folder2, magenta, "dir2 <=");
			// folders exclusive to folder2
			await copyFolder(foldersIn2, folder2, folder1, magenta, "dir1 <=");
		}
	}
}
