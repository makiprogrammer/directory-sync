import path from "node:path";
import { randomUUID } from "node:crypto";
import { bold, magenta, red } from "chalk";
import fse from "fs-extra";
const { version } = require("../package.json");

import { configFileName, FileTree, getFileTreeWithoutIgnoredItems } from "./diffs";
import {
	askYesOrNo,
	getIntersection,
	globMatch,
	groupByValue,
	logError,
	logGreen,
	UUID,
} from "./utils";

interface RootDirectory {
	/** the UUID of a directory - functions as an id */
	uuid: string;
	/** glob files and folders which belong to this directory only and can not be copied anywhere else. */
	excludeFromSync: string[];
	/** glob files and folders which can not be copied to this directory. */
	skipSyncing: string[];
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
			`Insufficient number of directories. Received ${dirs.length}, expected minimum 2.`
		);
	dirs.forEach(dir => {
		if (!fse.existsSync(dir)) errors.push(`Directory "${dir}" does not exist.`);
	});
	if (dirs.length !== new Set(dirs).size)
		errors.push("Some directories were specified more than once.");
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

function copyFile(source: FileTree, file: string, destination: FileTree) {
	fse.copyFile(path.join(source.absolutePath, file), path.join(destination.absolutePath, file));
	destination.files.add(file);
}
function copyFolder(source: FileTree, folder: string, destination: FileTree) {
	// instead of old-school whole-dir copying, we will carefully check each file & folder
	// // fse.copy(path.join(source.absolutePath, folder), path.join(destination.absolutePath, folder));
	fse.mkdirSync(path.join(destination.absolutePath, folder)); // sync because all other copying rely on this
	// we do not recursively copy whole dir - it will be taken care of by syncing function

	destination.folders.add(folder);
	destination.subDirs.push({
		name: folder,
		rootUuid: destination.rootUuid,
		absolutePath: path.join(destination.absolutePath, folder),
		relativePath: path.join(destination.relativePath, folder),
		files: new Set<string>(),
		folders: new Set<string>(),
		subDirs: [],
	});
}

async function syncFileTrees({
	fileTrees,
	excludeGlobs,
	skipGlobs,
	destinationQuestions,
}: {
	fileTrees: FileTree[];
	excludeGlobs: Record<string, Set<string>>;
	skipGlobs: Record<string, Set<string>>;
	destinationQuestions: boolean;
}) {
	// first, sync files
	for (const i in fileTrees) {
		const tree = fileTrees[i];
		const otherTrees = fileTrees.filter(t => t !== tree);
		const relativePath = (f: string) => path.join(tree.relativePath, f);
		// approach: ask and copy each file or folder to all other directories where it isn't

		// #region FILES
		// filter only the files which aren't present in at least one other directory
		const suggestedFiles = [...tree.files].filter(
			file =>
				otherTrees.some(
					t => !t.files.has(file) && !globMatch(relativePath(file), skipGlobs[t.rootUuid])
				)
			// select the file only if it isn't in a possible destination AND can be there (isn't skipped)
		);

		for (const { value: extension, items } of groupByValue(suggestedFiles, path.extname)) {
			let copyFileNames: string[] = [];
			let asGroup = false; // consider files as indivisible group
			if (items.length > 10) {
				if (
					await askYesOrNo(
						magenta,
						`Dir #${Number(i) + 1}: ${tree.absolutePath}: ${items.length} "${bold(
							extension
						)}" files`
					)
				) {
					copyFileNames = items;
					asGroup = true;
				} else if (
					await askYesOrNo(
						red,
						`Dir #${Number(i) + 1}: ${tree.absolutePath}: Want to ignore ${bold(
							"ALL current & future"
						)} ${bold(extension)} files in this specific directory?`
					)
				)
					excludeGlobs[tree.rootUuid].add(relativePath(`*${extension}`));
				else items.forEach(file => excludeGlobs[tree.rootUuid].add(relativePath(file)));
			} else
				for (const file of items)
					if (
						await askYesOrNo(
							magenta,
							`Dir #${Number(i) + 1}: ${path.join(tree.absolutePath, bold(file))}`
						)
					)
						copyFileNames.push(file);
					else excludeGlobs[tree.rootUuid].add(relativePath(file));

			if (!copyFileNames.length) continue; // if we have nothing to copy

			// actual copying files
			for (const j in fileTrees) {
				const destination = fileTrees[j];
				if (tree === destination) continue; // if it's the source tree
				if (copyFileNames.every(file => destination.files.has(file))) continue; // if it already has all files

				if (asGroup) {
					if (globMatch(relativePath(`*${extension}`), skipGlobs[destination.rootUuid]))
						continue; // it can not be copied to this destination
					if (
						!destinationQuestions ||
						(await askYesOrNo(
							magenta,
							`\tTo dir ${bold("#")}${bold(Number(j) + 1)}: all ${bold(
								copyFileNames.length
							)} ${bold(extension)} files`
						))
					)
						copyFileNames.forEach(file => copyFile(tree, file, destination));
					else skipGlobs[destination.rootUuid].add(relativePath(`*${extension}`));
				} else {
					// copy only the files that can be in this specific destination
					for (const file of copyFileNames.filter(
						file => !globMatch(relativePath(file), skipGlobs[destination.rootUuid])
					))
						if (
							!destinationQuestions ||
							(await askYesOrNo(
								magenta,
								`\tTo dir ${bold(`#${Number(j) + 1}`)}: ${bold(file)}`
							))
						)
							copyFile(tree, file, destination);
						else skipGlobs[destination.rootUuid].add(relativePath(file));
				}
			}
		}
		// #endregion

		// # region FOLDERS (which are not everywhere they possibly can be)
		// filter only the folders which aren't present in at least one other directory
		const suggestedFolders = [...tree.folders].filter(folder =>
			otherTrees.some(
				t =>
					!t.folders.has(folder) &&
					!globMatch(relativePath(folder), skipGlobs[t.rootUuid])
			)
		);

		for (const folder of suggestedFolders) {
			if (
				!(await askYesOrNo(
					magenta,
					`Dir #${Number(i) + 1}: ${path.join(tree.absolutePath, bold(folder))}`
				))
			) {
				excludeGlobs[tree.rootUuid].add(relativePath(folder));
				continue;
			}

			for (const j in fileTrees) {
				const destination = fileTrees[j];
				if (tree === destination) continue; // it's the source tree
				if (destination.folders.has(folder)) continue; // if it already has the folder
				if (globMatch(relativePath(folder), skipGlobs[tree.rootUuid])) continue; // the folder can not be copied to this destination

				if (
					!destinationQuestions ||
					(await askYesOrNo(
						magenta,
						`\tTo dir ${bold(`#${Number(j) + 1}`)}: ${bold(folder)}`
					))
				)
					// there is no need to also re-compute subDirs of each destination
					copyFolder(tree, folder, destination);
				else skipGlobs[destination.rootUuid].add(relativePath(folder));
			}
		}
	}

	// sync subdirectories recursively (only folders that were there before dirsync stared)
	// TODO: what if a folder is in 2 trees and not in 3rd? The 2 won't be synced
	for (const commonFolderName of getIntersection(
		...fileTrees.map(tree => new Set(tree.subDirs.map(subDir => subDir.name)))
	)) {
		await syncFileTrees({
			fileTrees: fileTrees.map(
				tree => tree.subDirs.find(subDir => subDir.name === commonFolderName) as FileTree
			),
			excludeGlobs,
			skipGlobs,
			destinationQuestions,
		});
	}
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
				dirs: configFiles.map((_, i2) => ({
					uuid: uuids[i2],
					excludeFromSync: [],
					skipSyncing: [],
				})),
			}
	);
	// 1b) merge `excludeFromSync` and `skipGlobs` lists together - create object with keys uuids and values `RootDirectory`-s
	const excludeGlobs = groupByValue(
		allConfigFiles.flatMap(config => config.dirs),
		dir => dir.uuid
	).reduce(
		(curr, { value: uuid, items }) => ({
			...curr,
			[uuid as UUID]: new Set(items.flatMap(config => config.excludeFromSync)),
		}),
		{} as Record<UUID, Set<string>>
	);
	const skipGlobs = groupByValue(
		allConfigFiles.flatMap(config => config.dirs),
		dir => dir.uuid
	).reduce(
		(curr, { value: uuid, items }) => ({
			...curr,
			[uuid as UUID]: new Set(items.flatMap(config => config.skipSyncing)),
		}),
		{} as Record<UUID, Set<string>>
	);

	// 2) for each root dir, read the file tree
	const fileTrees = dirs.map((dir, i) =>
		getFileTreeWithoutIgnoredItems({
			rootDir: dir,
			relativePath: "",
			rootUuid: uuids[i],
			excludeGlobs: excludeGlobs[uuids[i]],
		})
	);

	// 3) recursively sync directories
	logGreen("Syncing...");
	await syncFileTrees({
		fileTrees,
		excludeGlobs,
		skipGlobs,
		destinationQuestions: dirs.length > 2,
	});

	// 4) write config file to each directory
	dirs.forEach((dir, i) => {
		const config: DirsyncConfigFile = {
			dirsyncVersion: version,
			lastSyncDate: new Date().toISOString(),
			thisDirUuid: uuids[i],
			dirs: fileTrees.map((_, treeIndex) => ({
				uuid: uuids[treeIndex],
				excludeFromSync: Array.from(excludeGlobs[uuids[treeIndex]]),
				skipSyncing: Array.from(skipGlobs[uuids[treeIndex]]),
			})),
		};
		fse.writeFileSync(path.join(dir, configFileName), JSON.stringify(config));
	});

	logGreen("Done!");
}
