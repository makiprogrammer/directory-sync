import fse from "fs-extra";
import path from "path";

import {
	countValues,
	getDifference,
	getIntersection,
	logColor,
	logError,
	logWarning,
	systemFiles,
	systemFolders,
} from "./utils";

interface Folder {
	path: string;
	depth: number;

	name: string;
	files: string[];
	folders: Folder[];
}

interface Options {
	depth: string; // cannot be a number, because commander doesn't allow that
}

function getFolder(dir: string, depth: number, maxDepth: number): Folder {
	// list all children of the directory
	const dirents = fse.readdirSync(dir, { withFileTypes: true });
	const files = dirents
		.filter(d => !d.isDirectory())
		.map(d => d.name)
		.filter(f => !systemFiles.has(f));
	const folders = dirents
		.filter(d => d.isDirectory())
		.map(d => d.name)
		.filter(f => !systemFolders.has(f));

	return {
		path: dir,
		depth: depth,

		name: path.basename(dir),
		files: files,
		// recursion end condition
		folders:
			depth <= maxDepth
				? folders.map(f => getFolder(path.join(dir, f), depth + 1, maxDepth))
				: [],
	};
}

function compareFolders(folder1: Folder, folder2: Folder) {
	// compare files first
	const files1 = new Set(folder1.files);
	const files2 = new Set(folder2.files);

	const extra1 = getDifference(files1, files2);
	const extra2 = getDifference(files2, files1);

	if (extra1.size) {
		logColor(`Files in "${folder1.path}" are not in "${folder2.path}":`);
		if (extra1.size > 15)
			console.log(countValues([...extra1].map(filename => path.extname(filename))));
		else extra1.forEach(file => console.log(` - ${file}`));
	}
	if (extra2.size) {
		logColor(`Files in "${folder2.path}" are not in "${folder1.path}":`);
		if (extra2.size > 15)
			console.log(countValues([...extra2].map(filename => path.extname(filename))));
		else extra2.forEach(file => console.log(` - ${file}`));
	}

	// compare folders
	const folders1 = new Set(folder1.folders.map(f => f.name));
	const folders2 = new Set(folder2.folders.map(f => f.name));
	const extraFolders1 = getDifference(folders1, folders2);
	const extraFolders2 = getDifference(folders2, folders1);
	if (extraFolders1.size > 0) {
		logColor(`Folders in "${folder1.path}" are not in "${folder2.path}":`);
		extraFolders1.forEach(folder => console.log(` - ${folder}`));
	}
	if (extraFolders2.size > 0) {
		logColor(`Folders in "${folder2.path}" are not in "${folder1.path}":`);
		extraFolders2.forEach(folder => console.log(` - ${folder}`));
	}

	// compare common folders
	getIntersection(folders1, folders2).forEach(folderName => {
		const subfolder1 = folder1.folders.find(f => f.name === folderName) as Folder;
		const subfolder2 = folder2.folders.find(f => f.name === folderName) as Folder;
		compareFolders(subfolder1, subfolder2);
	});
}

function errorChecking(dir1: string, dir2: string, options: Options) {
	let error = false;
	if (!fse.existsSync(dir1)) {
		logError(`Directory "${dir1}" does not exist.`);
		error = true;
	}
	if (!fse.existsSync(dir2)) {
		logError(`Directory "${dir2}" does not exist.`);
		error = true;
	}
	if (isNaN(Number(options.depth))) {
		logError(`Depth "${options.depth}" is not a number.`);
		error = true;
	} else if (Number(options.depth) % 1 !== 0) {
		logError(`Depth "${options.depth}" is not a whole number.`);
		error = true;
	}
	// using variable, because we want to list all possible errors
	return error;
}

export default function analyseDirectories(dir1: string, dir2: string, options: Options) {
	if (errorChecking(dir1, dir2, options)) return;
	const maxDepth = Number(options.depth);

	// get sub-directories and files
	const folder1 = getFolder(dir1, 0, maxDepth);
	const folder2 = getFolder(dir2, 0, maxDepth);

	// compare sub-directories and files
	if (folder1.name !== folder2.name)
		logWarning(`Root folder names differ: "${folder1.name}" and "${folder2.name}"`);
	compareFolders(folder1, folder2);
}
