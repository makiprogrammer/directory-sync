import path from "node:path";
import fse from "fs-extra";

import { getDifference, getIntersection } from "./utils";

export const configFileName = "dirsync.config.json";

const systemFiles = new Set(["desktop.ini"]);
const systemFolders = new Set(["System Volume Information"]);
const systemNames = new Set([...systemFiles, ...systemFolders, configFileName]);

function getChildren(dir: string) {
	// readdirsync return list of so-called "dirents"
	const allChildren = fse
		.readdirSync(dir, { withFileTypes: true })
		.filter(d => !systemNames.has(d.name));
	const files = allChildren.filter(d => !d.isDirectory()).map(d => d.name);
	const folders = allChildren.filter(d => d.isDirectory()).map(d => d.name);
	return [new Set(files), new Set(folders)];
}

export interface Folder {
	name: string;
	path: string;
	filesOnlyHere: Set<string>;
	foldersOnlyHere: Set<string>;
	isEmpty: boolean;
	subDirs: Folder[];
	// added in `syncDirectories`:
	ignoreFiles?: string[];
	ignoreFolders?: string[];
}

export default function getDifferences(path1: string, path2: string): [Folder, Folder] {
	const [files1, folders1] = getChildren(path1);
	const [files2, folders2] = getChildren(path2);

	const filesOnlyIn1 = getDifference(files1, files2);
	const filesOnlyIn2 = getDifference(files2, files1);
	const foldersOnlyIn1 = getDifference(folders1, folders2);
	const foldersOnlyIn2 = getDifference(folders2, folders1);
	const foldersInBoth = getIntersection(folders1, folders2);

	const subDirsDiffs = [...foldersInBoth].map(folder =>
		getDifferences(path.join(path1, folder), path.join(path2, folder))
	);

	return [
		{
			name: path.basename(path1),
			path: path1,
			filesOnlyHere: filesOnlyIn1,
			foldersOnlyHere: foldersOnlyIn1,
			isEmpty: !(files1.size + folders1.size),
			subDirs: subDirsDiffs.map(subDir => subDir[0]),
		},
		{
			name: path.basename(path2),
			path: path1,
			filesOnlyHere: filesOnlyIn2,
			foldersOnlyHere: foldersOnlyIn2,
			isEmpty: !(files2.size + folders2.size),
			subDirs: subDirsDiffs.map(subDir => subDir[1]),
		},
	];
}
