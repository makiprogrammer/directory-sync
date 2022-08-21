import fse from "fs-extra";
import path from "path";

import { getDifference, getIntersection, systemFiles, systemFolders } from "./utils";

export interface Folder {
	path: string;
	depth: number;

	name: string;
	files: string[];
	folders: Folder[];
	isEmpty: boolean;
}

export interface Diff {
	folder1: Folder;
	folder2: Folder;

	filesIn1: Set<string>;
	filesIn2: Set<string>;
	foldersIn1: Set<string>;
	foldersIn2: Set<string>;
}

export function getFolder(dir: string, depth: number, maxDepth: number): Folder {
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
		folders:
			// recursion end condition
			depth <= maxDepth
				? folders.map(f => getFolder(path.join(dir, f), depth + 1, maxDepth))
				: [],
		isEmpty: !(files.length + folders.length),
	};
}

export function compareFolders(folder1: Folder, folder2: Folder): Diff[] {
	// compare files
	const files1 = new Set(folder1.files);
	const files2 = new Set(folder2.files);
	const filesIn1 = getDifference(files1, files2);
	const filesIn2 = getDifference(files2, files1);

	// compare folders
	const folders1 = new Set(folder1.folders.map(f => f.name));
	const folders2 = new Set(folder2.folders.map(f => f.name));
	const foldersIn1 = getDifference(folders1, folders2);
	const foldersIn2 = getDifference(folders2, folders1);

	let diffs: Diff[] = [{ folder1, folder2, filesIn1, filesIn2, foldersIn1, foldersIn2 }];

	// compare folders with common name - recursion
	getIntersection(folders1, folders2).forEach(folderName => {
		const subfolder1 = folder1.folders.find(f => f.name === folderName) as Folder;
		const subfolder2 = folder2.folders.find(f => f.name === folderName) as Folder;
		diffs = diffs.concat(compareFolders(subfolder1, subfolder2));
	});

	return diffs;
}
