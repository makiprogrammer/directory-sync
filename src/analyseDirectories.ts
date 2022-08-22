import fse from "fs-extra";
import path from "path";
import { bold } from "chalk";

import getDifferences, { Folder } from "./diffs";
import { groupByValue, logError, logGreen, logRed, logWarning, logYellow } from "./utils";

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

function jsonDifference(diff: Folder): unknown {
	return {
		...diff,
		filesOnlyHere: [...diff.filesOnlyHere],
		foldersOnlyHere: [...diff.foldersOnlyHere],
		subDirs: diff.subDirs.map(jsonDifference),
	};
}

function displayDifferences(diffs: [Folder, Folder]) {
	const [dir1, dir2] = diffs;

	// files only in dir1
	groupByValue([...dir1.filesOnlyHere], path.extname).map(({ value: extension, items }) => {
		if (items.length > 10)
			return logGreen(
				` + ${dir1.path}: total of ${items.length} files with extension ${bold(extension)}`
			);
		items.forEach(filename => logGreen(` + ${path.join(dir1.path, bold(filename))}`));
	});
	// files only in dir2
	groupByValue([...dir2.filesOnlyHere], path.extname).map(({ value: extension, items }) => {
		if (items.length > 10)
			return logRed(
				` - ${dir2.path}: total of ${items.length} files with extension ${bold(extension)}`
			);
		items.forEach(filename => logRed(` - ${path.join(dir2.path, bold(filename))}`));
	});

	// folders only in dir1
	if (dir1.foldersOnlyHere.size) {
		if (dir1.foldersOnlyHere.size > 10)
			logGreen(` + ${dir1.path}: total of ${bold(dir1.foldersOnlyHere.size)} folders`);
		else dir1.foldersOnlyHere.forEach(f => logGreen(` + ${path.join(dir1.path, bold(f))}`));
	}
	// folders exclusive to folder2
	if (dir2.foldersOnlyHere.size) {
		if (dir2.foldersOnlyHere.size > 10)
			logRed(` - ${dir2.path}: total of ${bold(dir2.foldersOnlyHere.size)} folders`);
		else dir2.foldersOnlyHere.forEach(f => logRed(` - ${path.join(dir2.path, bold(f))}`));
	}
}

export default function analyseDirectories(dir1: string, dir2: string, options: Options) {
	if (errorChecking(dir1, dir2, options).length) return;

	const diffs = getDifferences(dir1, dir2);
	if (diffs[0].name !== diffs[1].name)
		logWarning(`Root folder names differ: "${diffs[0].name}" and "${diffs[1].name}"`);

	if (options.outputFile) {
		// save to the file
		fse.writeFileSync(options.outputFile, JSON.stringify(diffs.map(jsonDifference)));
		logGreen(`Results saved to ${options.outputFile}`);
	} else displayDifferences(diffs);
}
