import fse from "fs-extra";
import path from "path";
import { bold } from "chalk";

import { getFolder, compareFolders, Diff } from "./folders";
import { groupByComputedValue, logError, logGreen, logRed, logWarning, logYellow } from "./utils";

interface Options {
	outputFile?: string;
}

function errorChecking(dir1: string, dir2: string, options: Options) {
	const errors = [];
	if (!fse.existsSync(dir1)) errors.push(`Directory "${dir1}" does not exist.`);
	if (!fse.existsSync(dir2)) errors.push(`Directory "${dir2}" does not exist.`);
	errors.forEach(logError);
	return errors;
}

function jsonDifferences(diffs: Diff[]) {
	return {
		stats: {
			filesExtraIn1: diffs.reduce((acc, diff) => acc + diff.filesIn1.size, 0),
			filesExtraIn2: diffs.reduce((acc, diff) => acc + diff.filesIn2.size, 0),
			foldersExtraIn1: diffs.reduce((acc, diff) => acc + diff.foldersIn1.size, 0),
			foldersExtraIn2: diffs.reduce((acc, diff) => acc + diff.foldersIn2.size, 0),
			datetime: new Date().toISOString(),
		},
		diffs: diffs
			.filter(
				({ filesIn1, filesIn2, foldersIn1, foldersIn2 }) =>
					filesIn1.size + filesIn2.size + foldersIn1.size + foldersIn2.size
			)
			.map(diff => ({
				folder1: diff.folder1.path,
				folder2: diff.folder2.path,
				filesExtraIn1: [...diff.filesIn1],
				filesExtraIn2: [...diff.filesIn2],
				foldersExtraIn1: [...diff.foldersIn1],
				foldersExtraIn2: [...diff.foldersIn2],
			})),
	};
}

function displayDifferences(diffs: Diff[]) {
	const totalFilesExtra = diffs.reduce((acc, diff) => acc + diff.filesIn1.size, 0);
	const totalFilesLacking = diffs.reduce((acc, diff) => acc + diff.filesIn2.size, 0);
	const totalFoldersExtra = diffs.reduce((acc, diff) => acc + diff.foldersIn1.size, 0);
	const totalFoldersLacking = diffs.reduce((acc, diff) => acc + diff.foldersIn2.size, 0);
	if (totalFilesExtra + totalFoldersExtra)
		logYellow(
			`${totalFilesExtra} file(s) and ${totalFoldersExtra} folder(s) were found exclusive in 1st directory tree.`
		);
	if (totalFilesLacking + totalFoldersLacking)
		logYellow(
			`${totalFilesLacking} file(s) and ${totalFoldersLacking} folder(s) were found exclusive in 2nd directory tree.`
		);

	diffs.forEach(({ folder1, folder2, filesIn1, filesIn2, foldersIn1, foldersIn2 }) => {
		// files exclusive to folder1
		groupByComputedValue([...filesIn1], path.extname).map(({ value: fileExtension, items }) => {
			if (items.length > 10)
				return logGreen(
					` + ${folder1.path}: total of ${items.length} files with extension ${bold(
						fileExtension
					)}`
				);
			items.forEach(filename => logGreen(` + ${path.join(folder1.path, bold(filename))}`));
		});
		// files exclusive to folder2
		groupByComputedValue([...filesIn2], path.extname).map(({ value: fileExtension, items }) => {
			if (items.length > 10)
				return logRed(
					` - ${folder2.path}: total of ${items.length} files with extension ${bold(
						fileExtension
					)}`
				);
			items.forEach(filename => logRed(` - ${path.join(folder2.path, bold(filename))}`));
		});

		// folders exclusive to folder1
		if (foldersIn1.size) {
			if (foldersIn1.size > 10)
				logGreen(` + ${folder1.path}: total of ${bold(foldersIn1.size)} folders`);
			else
				foldersIn1.forEach(folder =>
					logGreen(` + ${path.join(folder1.path, bold(folder))}`)
				);
		}
		// folders exclusive to folder2
		if (foldersIn2.size) {
			if (foldersIn2.size > 10)
				logRed(` - ${folder2.path}: total of ${bold(foldersIn2.size)} folders`);
			else
				foldersIn2.forEach(folder => logRed(` - ${path.join(folder2.path, bold(folder))}`));
		}
	});
}

export default function analyseDirectories(dir1: string, dir2: string, options: Options) {
	if (errorChecking(dir1, dir2, options).length) return;

	// get sub-directories and files
	const folder1 = getFolder(dir1);
	const folder2 = getFolder(dir2);

	if (folder1.name !== folder2.name)
		logWarning(`Root folder names differ: "${folder1.name}" and "${folder2.name}"`);

	// compare sub-directories and files
	const diffs = compareFolders(folder1, folder2);

	if (options.outputFile) {
		// save to the file
		fse.writeFileSync(options.outputFile, JSON.stringify(jsonDifferences(diffs), null, "\t"));
		logGreen(`Results saved to ${options.outputFile}`);
	} else displayDifferences(diffs);
}
