import path from "node:path";
import fse from "fs-extra";
import { globMatch } from "./utils";

export const configFileName = "dirsync.config.json";

const systemFiles = new Set(["desktop.ini"]);
const systemFolders = new Set(["System Volume Information"]);
const systemNames = new Set([...systemFiles, ...systemFolders, configFileName]);

export interface FileTree {
	name: string;
	absolutePath: string;
	relativePath: string;
	files: Set<string>;
	folders: Set<string>;
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

	// using glob matching for advanced filtering options
	const filteringFunction = (f: string) => !globMatch(path.join(relativePath, f), [...ignore]);
	const filteredFileNames = fileNames.filter(filteringFunction);
	const filteredFolderNames = folderNames.filter(filteringFunction);

	// TODO: remove from `ignore` items that don't exist

	return {
		name: path.basename(relativePath),
		absolutePath: path.join(rootDir, relativePath),
		relativePath,
		files: new Set(filteredFileNames),
		folders: new Set(filteredFolderNames),
		subDirs: filteredFolderNames.map(folder =>
			getFileTreeWithoutIgnoredItems(rootDir, path.join(relativePath, folder), ignore)
		),
	};
}
