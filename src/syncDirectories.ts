import path from "node:path";
import { randomUUID } from "node:crypto";
import { bold, magenta } from "chalk";
import fse from "fs-extra";
const { version } = require("../package.json");

import { configFileName, FileTree, getFileTreeWithoutIgnoredItems } from "./diffs";
import { askYesOrNo, groupByValue, logError, logGreen, UUID } from "./utils";

interface RootDirectory {
	uuid: string;
	ignore: string[];
	// TODO: maybe add presets for local drives, external backup drives, etc.
	// TODO: ... and from that derive default behaviour
}

interface DirsyncConfigFile {
	lastSyncDate: string;
	dirsyncVersion: string;
	thisDirUuid: string;
	dirs: RootDirectory[];
}

interface Options {
	force?: boolean;
}

function errorChecking(options: Options, dirs: string[]) {
	const errors = [];
	if (!dirs.length) errors.push("No directories specified");
	else if (dirs.length < 2)
		errors.push(
			`Insufficient number of directories. Received ${dirs.length}, expected minumim 2.`
		);
	dirs.forEach(dir => {
		if (!fse.existsSync(dir)) errors.push(`Directory "${dir}" does not exist.`);
	});
	errors.forEach(logError);
	return errors.length;
}

function readConfigFiles(dirs: string[]) {
	return dirs
		.map(dir => path.join(dir, configFileName))
		.map(path =>
			fse.existsSync(path)
				? (JSON.parse(fse.readFileSync(path, "utf-8")) as DirsyncConfigFile)
				: undefined
		);
}

async function syncFileTrees(
	fileTrees: FileTree[],
	ignored: Record<string, Set<string>>,
	uuids: string[]
) {
	// first, sync files
	for (const i in fileTrees) {
		const tree = fileTrees[i];
		const otherTrees = fileTrees.filter(t => t !== tree);
		// approach: ask and copy each file to all other directories where it isn't

		// filter only the files which aren't present in at least one directory
		const suggestedFiles = [...tree.files].filter(
			file => otherTrees.filter(t => !t.files.has(file)).length
		);
		console.log(suggestedFiles);

		for (const { value: extension, items } of groupByValue(suggestedFiles, path.extname)) {
			let copyFileNames: string[] = [];
			if (items.length > 10) {
				if (
					await askYesOrNo(
						magenta(
							`Dir #${i + 1}: ${tree.absolutePath}: ${items.length} "${bold(
								extension
							)}" files (y/n) `
						)
					)
				)
					copyFileNames = items;
				else
					items.forEach(file =>
						ignored[uuids[i]].add(path.join(tree.relativePath, file))
					);
			} else
				for (const file of items)
					if (
						await askYesOrNo(
							magenta(
								`Dir #${i + 1}: ${path.join(tree.absolutePath, bold(file))} (y/n) `
							)
						)
					)
						copyFileNames.push(file);
					else ignored[uuids[i]].add(path.join(tree.relativePath, file));

			copyFileNames.forEach(file =>
				otherTrees
					.filter(t => !t.files.has(file))
					.forEach(destination => {
						fse.copyFile(
							path.join(tree.absolutePath, file),
							path.join(destination.absolutePath, file)
						);
						destination.files.add(file);
					})
			);
		}
	}

	// then, sync directories (recursively)
	// TODO
}

export default async function syncDirectories(options: Options, dirs: string[]) {
	if (errorChecking(options, dirs)) return;
	if (options.force) return logError("Force option is not yet implemented.");

	logGreen("Analysing...");
	const configFiles = readConfigFiles(dirs);

	/* 
	TIME TO WRITE SOME PSEUDOCODE
	1) merge all configFiles together to get list of all root dirs (and their uuids and ignored children)
	2) for each root dir, read all files&directories except those ignored and store this file tree,
	   (cleanup: if something is specified as "ignored" but not present, delete from list of ignored)
	3) recursively go through read files&subdirs and copy them if necessary (if missing)
	   TODO: if a file is present in both dirs, compare them by date-of-last-modification prop if possible
	4) merge new and old config together & save config to each root dir
	*/

	// 1a) if we have no config file, create an empty one
	const uuids = configFiles.map(config => config?.thisDirUuid || randomUUID());
	const allConfigFiles = configFiles.map(
		(config, i) =>
			config ?? {
				lastSyncDate: "never",
				dirsyncVersion: "unknown",
				thisDirUuid: uuids[i],
				dirs: configFiles.map((_, i2) => ({ uuid: uuids[i2], ignore: [] })),
			}
	);
	// 1b) merge `ignore` lists together - create object with keys uuids and values `RootDirectory`-s
	const ignoreLists = groupByValue(
		allConfigFiles.flatMap(config => config.dirs),
		dir => dir.uuid
	).reduce(
		(curr, { value: uuid, items }) => ({
			...curr,
			[uuid as UUID]: new Set(items.flatMap(config => config.ignore)),
		}),
		{} as Record<UUID, Set<string>>
	);

	// 2) for each root dir, read the file tree
	const fileTrees = dirs.map((dir, i) =>
		getFileTreeWithoutIgnoredItems(dir, "", ignoreLists[uuids[i]])
	);
	console.log(fileTrees);

	// 3) recursively sync directories
	await syncFileTrees(fileTrees, ignoreLists, uuids);

	// 4) write config file to each directory
	dirs.forEach((dir, i) => {
		const config: DirsyncConfigFile = {
			dirsyncVersion: version,
			lastSyncDate: new Date().toISOString(),
			thisDirUuid: uuids[i],
			dirs: fileTrees.map((_, treeIndex) => ({
				uuid: uuids[treeIndex],
				ignore: Array.from(ignoreLists[uuids[treeIndex]]),
			})),
		};
		fse.writeFileSync(path.join(dir, configFileName), JSON.stringify(config));
	});

	logGreen("Done!");
}
