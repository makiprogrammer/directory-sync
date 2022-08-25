import path from "node:path";
import fse from "fs-extra";

export const configFileName = "dirsync.config.json";

const systemFiles = new Set(["desktop.ini"]);
const systemFolders = new Set(["System Volume Information"]);
const systemNames = new Set([...systemFiles, ...systemFolders, configFileName]);

export interface FileTree {
	name: string;
	absolutePath: string;
	relativePath: string;
	files: Set<string>;
	subDirs: FileTree[];
}

export function getFileTreeWithoutIgnoredItems(
	rootDir: string,
	relativePath: string,
	ignore: Set<string>
): FileTree {
	// readdirsync return list of so-called "dirents"
	const allChildren = fse
		.readdirSync(path.join(rootDir, relativePath), { withFileTypes: true })
		.filter(d => !systemNames.has(d.name));

	// only basenames (short names)
	const fileNames = allChildren.filter(d => !d.isDirectory()).map(f => f.name);
	const folderNames = allChildren.filter(d => d.isDirectory()).map(f => f.name);

	// TODO: add `npm i micromatch` package for complete ignore patterns
	const filteredFileNames = fileNames.filter(f => !ignore.has(path.join(relativePath, f)));
	const filteredFolderNames = folderNames.filter(f => !ignore.has(path.join(relativePath, f)));

	// TODO: remove from `ignore` items that don't exist

	return {
		name: path.basename(relativePath),
		absolutePath: path.join(rootDir, relativePath),
		relativePath,
		files: new Set(filteredFileNames),
		subDirs: filteredFolderNames.map(folder =>
			getFileTreeWithoutIgnoredItems(rootDir, path.join(relativePath, folder), ignore)
		),
	};
}
