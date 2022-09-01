import path from "node:path";
import { randomUUID } from "node:crypto";
import { bold, green, magenta, red } from "chalk";
import fse from "fs-extra";
const { version } = require("../package.json");

import { configFileName, FileTree, getFileTreeWithoutIgnoredItems, UUID } from "./diffs";
import { askYesOrNo, globMatch, groupByValue, logColor, logError, logWarning } from "./utils";

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
	multiple?: boolean;
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

function copyFile(source: FileTree, file: string, destination: FileTree, errors: unknown[]) {
	try {
		fse.copyFile(
			path.join(source.absolutePath, file),
			path.join(destination.absolutePath, file)
		);
	} catch (e) {
		errors.push(e);
	}
	destination.files.add(file);
}
function copyFolder(source: FileTree, folder: string, destination: FileTree, errors: unknown[]) {
	// instead of old-school whole-dir copying, we will carefully check each file & folder
	try {
		fse.mkdirSync(path.join(destination.absolutePath, folder)); // sync because all other copying rely on this
	} catch (e) {
		errors.push(e);
	}
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
	twoDirsMode,
	errors,
}: {
	fileTrees: FileTree[];
	excludeGlobs: Record<string, Set<string>>;
	skipGlobs: Record<string, Set<string>>;
	twoDirsMode: boolean;
	errors: unknown[];
}) {
	// if we sync only 2 dirs, `excludeGlobs` shouldn't be modified - globs are added only to `skipGlobs`
	// this improves UX and is more intuitive

	for (const i in fileTrees) {
		const tree = fileTrees[i];
		if (tree.isSyncedWithEverything) continue;
		const otherTrees = fileTrees.filter(t => t !== tree);
		const from = Number(i) + 1;
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
						`From dir #${from}: ${tree.absolutePath}: ${items.length} "${bold(
							extension
						)}" files`
					)
				) {
					copyFileNames = items;
					asGroup = true;
				} else if (twoDirsMode) {
					// just add the files to skipped set of the other tree
					skipGlobs[otherTrees[0].rootUuid].add(relativePath(`*${extension}`));
				} else if (
					await askYesOrNo(
						red,
						`From dir #${from}: ${tree.absolutePath}: Prevent ${bold(
							"ALL current & future"
						)} ${bold(extension)} files in this specific directory from syncing?`
					)
				) {
					// prevent all current and future files from syncing (this extension and subdirectory only)
					excludeGlobs[tree.rootUuid].add(relativePath(`*${extension}`));
				} else {
					// prevent only these files from syncing
					items.forEach(file => excludeGlobs[tree.rootUuid].add(relativePath(file)));
				}
			} else
				for (const file of items)
					if (
						await askYesOrNo(
							magenta,
							`From dir #${from}: ${path.join(tree.absolutePath, bold(file))}`
						)
					)
						copyFileNames.push(file);
					else if (twoDirsMode) skipGlobs[otherTrees[0].rootUuid].add(relativePath(file));
					else excludeGlobs[tree.rootUuid].add(relativePath(file));

			if (!copyFileNames.length) continue; // if we have nothing to copy

			// actual copying files
			for (const j in fileTrees) {
				const destination = fileTrees[j];
				if (tree === destination) continue; // if it's the source tree
				if (copyFileNames.every(file => destination.files.has(file))) continue; // if it already has all files
				const to = Number(j) + 1;

				if (asGroup) {
					if (globMatch(relativePath(`*${extension}`), skipGlobs[destination.rootUuid]))
						continue; // it can not be copied to this destination
					if (
						twoDirsMode ||
						(await askYesOrNo(
							magenta,
							`\tTo dir ${bold(`#${to}`)}: all ${bold(
								`${copyFileNames.length} ${extension}`
							)} files`
						))
					)
						copyFileNames.forEach(file => copyFile(tree, file, destination, errors));
					else skipGlobs[destination.rootUuid].add(relativePath(`*${extension}`));
				} else {
					// copy only the files that can be in this specific destination
					for (const file of copyFileNames.filter(
						file => !globMatch(relativePath(file), skipGlobs[destination.rootUuid])
					))
						if (
							twoDirsMode ||
							(await askYesOrNo(magenta, `\tTo dir ${bold(`#${to}`)}: ${bold(file)}`))
						)
							copyFile(tree, file, destination, errors);
						else skipGlobs[destination.rootUuid].add(relativePath(file));
				}
			}
		}
		// #endregion

		// #region FOLDERS (which are not everywhere they possibly can be)
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
					`From dir #${from}: ${path.join(tree.absolutePath, bold(folder))}`
				))
			) {
				if (twoDirsMode) skipGlobs[otherTrees[0].rootUuid].add(relativePath(folder));
				else excludeGlobs[tree.rootUuid].add(relativePath(folder));
				continue;
			}

			for (const j in fileTrees) {
				const destination = fileTrees[j];
				if (tree === destination) continue; // it's the source tree
				if (destination.folders.has(folder)) continue; // if it already has the folder
				if (globMatch(relativePath(folder), skipGlobs[tree.rootUuid])) continue; // the folder can not be copied to this destination
				const to = Number(j) + 1;

				if (
					twoDirsMode ||
					(await askYesOrNo(magenta, `\tTo dir ${bold(`#${to}`)}: ${bold(folder)}`))
				)
					copyFolder(tree, folder, destination, errors);
				else skipGlobs[destination.rootUuid].add(relativePath(folder));
			}
		}
		// #endregion

		// #region FOLDERS (continued - which are at least in 2 dirs)
		// filter only the folders which are in at least 1 other dir
		for (const folder of tree.folders.values()) {
			const syncableTrees = otherTrees.filter(t => t.folders.has(folder));
			if (!syncableTrees.length) continue;
			const findChild = (t: FileTree) =>
				t.subDirs.find(subDir => subDir.name === folder) as FileTree;

			await syncFileTrees({
				fileTrees: [findChild(tree), ...syncableTrees.map(findChild)],
				excludeGlobs,
				skipGlobs,
				twoDirsMode,
				errors,
			});
		}
		// #endregion

		tree.isSyncedWithEverything = true;
	}
}

export default async function syncDirectories(options: Options, dirs: string[]) {
	if (errorChecking(options, dirs)) return;
	if (options.force) return logError("Force option is not yet implemented.");

	logColor(green, "Analysing...");
	const configFiles = readConfigFiles(dirs);

	/* 
	TIME TO WRITE SOME PSEUDOCODE
	1) merge all configFiles together to get list of all root dirs (and their uuids and ignored children)
	2) for each root dir, read all files & directories except excluded and store this file tree,
	   (cleanup: if something is specified as "excluded" but not present, delete from list)
	3) recursively go through read files&subdirs and copy them if necessary (if missing)
	   TODO: if a file is present in both dirs, compare them by date-of-last-modification prop if possible
	4) save new config to each root dir
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
	logColor(green, "Syncing...");
	const syncErrors: unknown[] = [];
	await syncFileTrees({
		fileTrees,
		excludeGlobs,
		skipGlobs,
		twoDirsMode: options.multiple ? false : dirs.length === 2,
		errors: syncErrors,
	});

	if (syncErrors.length) {
		const errorFile = "dirsync.errors.json";
		logWarning(
			`${syncErrors.length} error(s) occured. Details are saved to ${path.join(
				process.cwd(),
				errorFile
			)}`
		);
		fse.writeFileSync(errorFile, JSON.stringify(syncErrors));
	}

	// 4) write config file to each directory
	logColor(green, "Saving configs...");
	dirs.forEach((dir, i) => {
		const config: DirsyncConfigFile = {
			dirsyncVersion: version,
			lastSyncDate: new Date().toISOString(),
			thisDirUuid: uuids[i],
			dirs: fileTrees.map(tree => ({
				uuid: tree.rootUuid,
				excludeFromSync: Array.from(excludeGlobs[tree.rootUuid]),
				skipSyncing: Array.from(skipGlobs[tree.rootUuid]),
			})),
		};
		fse.writeFileSync(path.join(dir, configFileName), JSON.stringify(config));
	});

	logColor(green, "Done!");
}
