import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import fileTreeSelectionPrompt from "inquirer-file-tree-selection-prompt";
import simpleGit from "simple-git";
import cliProgress from "cli-progress";
import readline from "readline";
import fetch from "node-fetch";
import { title } from "process";

const GITHUB_TOKEN = "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";
const REPO_OWNER = "agadfs";
const REPO_NAME = "Git_PTIDEJ_Issue_Organizer";

/* 
const GITHUB_TOKEN = "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";
const REPO_OWNER = "ptidejteam";
const REPO_NAME = "ptidej-Ptidej";
 */
async function createIssueAPI(title, body) {
  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        title,
        body,
      }),
    }
  );

  if (response.ok) {
    const issue = await response.json();
    console.log(`Issue created: ${issue.html_url}`);
  } else {
    console.error(`Failed to create issue: ${response.statusText}`);
  }
}

inquirer.registerPrompt("file-tree-selection", fileTreeSelectionPrompt);

let stopRequested = false;

function extractComments(fileContent, fileExtension, filePath) {
  const allLines = fileContent.split("\n");
  let functionStack = 0;
  const todoComments = [];
  let currentFunctionName = "Global scope";

  let title_builder = "";

  let message_builder = "";

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();

    // Track scope: Count opening and closing braces
    if (line.includes("{")) {
      functionStack++;
    }
    if (line.includes("}")) {
      functionStack--;
    }
    if (currentFunctionName !== "Global scope" && functionStack === 1) {
      currentFunctionName = "Global scope";
    }
    if (line.startsWith("public") || line.startsWith("private")) {
      currentFunctionName = line.split("(")[0];
    }

    // Handle TODO comments and multi-line comments (including indented lines)
    if (
      line.startsWith("//") &&
      !line.includes("Auto-generated") &&
      !line.includes("Auto generated") &&
      line.includes("TODO")
    ) {
      let currentCommentBlock = line;

      // Capture multi-line TODO comments (including indented lines)
      let j = i + 1;
      while (
        allLines[j].trim().startsWith("//") &&
        !line.includes("Auto-generated") &&
        !line.includes("Auto generated") &&
        j < allLines.length
      ) {
        currentCommentBlock += `\n${allLines[j].trim()}`;
        j++;
      }
      i = j - 1; // Update the main loop to skip processed lines

      // Use the file name as the title
      todoComments.push({
        comment: currentCommentBlock.trim(),
        function: `Method: ${currentFunctionName}()`,
      });
    }
  }

  return todoComments;
}

let issues_countewr = 0;
async function selectDirectory(promptMessage) {
  const answers = await inquirer.prompt([
    {
      type: "file-tree-selection",
      name: "directory",
      message: promptMessage,
      onlyShowDir: true,
      root: "C:\\Users\\henri\\OneDrive\\Documentos\\projetos",
    },
  ]);
  return answers.directory;
}

function findJavaFiles(dir) {
  let results = [];
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(findJavaFiles(filePath));
    } else if (file.endsWith(".java")) {
      results.push(filePath);
    }
  }

  return results;
}

async function collectComments() {
  try {
    const repoPath = await selectDirectory("Select the folder to analyze:");
    if (!fs.existsSync(path.join(repoPath, ".git"))) {
      console.error("The selected folder is not a valid git repository.");
      return;
    }

    const outputDir = await selectDirectory(
      "Select the folder for the .txt to be saved:"
    );

    const git = simpleGit(repoPath);

    const outputFilePath = path.join(outputDir, "comments_by_commit.txt");
    const javaFiles = findJavaFiles(repoPath);

    console.log('Press "s" to stop the process at any time.');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.input.on("keypress", (char, key) => {
      if (key && key.name === "s") {
        console.log("\nStopping process...");
        stopRequested = true;
        rl.close();
      }
    });

    const progressBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    progressBar.start(javaFiles.length, 0);

    const groupedComments = {};
    const repoCommits = await git.log();

    const startTime = Date.now(); // Record the start time of the process
    process.stdout.write("\u001b[3B"); // Move cursor up 3 lines and clear them
    const tenPercentFiles = Math.ceil(javaFiles.length * 0.1); // Calculate 10% of total files
    let firstTenPercentTime = 0; // Time taken for the first 10% of files
    let estimatedTotalTime = 0; // Estimated total processing time
    let dynamicRemainingTime = 0; // Dynamically updated remaining time
    let lastRecalculationThreshold = 0; // Track the last threshold for recalculation (e.g., 10%, 20%)

    for (const [index, file] of javaFiles.entries()) {
      if (stopRequested) break;
      const elapsedTime = (Date.now() - startTime) / 1000; // Total elapsed time in seconds
      const relativeFilePath = path.relative(repoPath, file);
      if (
        relativeFilePath.includes("rsc") ||
        relativeFilePath.includes("resources")
      ) {
        continue; // Skip this file and move to the next iteration
      }
      const processedFiles = index + 1; // Files processed so far
      const totalFiles = javaFiles.length; // Total files to process
      const remainingFiles = totalFiles - processedFiles; // Files left to process

      // Recalculate every 10% of files read
      if (processedFiles >= lastRecalculationThreshold + tenPercentFiles) {
        lastRecalculationThreshold =
          Math.floor(processedFiles / tenPercentFiles) * tenPercentFiles; // Update the threshold
        const avgTimePerFile = elapsedTime / processedFiles; // Average time per file
        estimatedTotalTime = avgTimePerFile * totalFiles; // Recalculate the total processing time
        dynamicRemainingTime = Math.ceil(estimatedTotalTime - elapsedTime); // Update the remaining time
      } else {
        // Continuously decrement the remaining time based on elapsed time
        dynamicRemainingTime = Math.max(
          0,
          Math.ceil(estimatedTotalTime - elapsedTime)
        );
      }

      const estimatedRemainingTime =
        processedFiles <= tenPercentFiles
          ? `Calculating...` // Show "Calculating..." during the first 10%
          : `${dynamicRemainingTime} seconds`; // Countdown or recalculated time after 10%

      // Clear the lines and write updated information
      process.stdout.write("\u001b[3A\u001b[K"); // Move cursor up 3 lines and clear them
      process.stdout.write(`Made by Henrique de Freitas Serra - 2025\n `); // Customizable message
      process.stdout.write(
        `Estimated time remaining: ${estimatedRemainingTime} \n`
      );
      process.stdout.write(`Current file: ${relativeFilePath} \n`);

      // Update the progress bar
      progressBar.update(index + 1);

      const fileContent = fs.readFileSync(file, "utf8");

      const commentsWithFunctions = extractComments(
        fileContent,
        "java",
        relativeFilePath
      );

      if (commentsWithFunctions.length > 0) {
        // Fetch detailed commit history for the file
        const fileCommits = await git.raw([
          "log",
          "--name-only",
          "--pretty=format:%H;%an;%ae;%ad",
          relativeFilePath,
        ]);

        if (!fileCommits) {
          continue;
        }

        const commits = fileCommits.split("\n\n").map((entry) => {
          const [header, ...files] = entry.split("\n");
          const [hash, authorName, authorEmail, date] = header.split(";");
          return {
            hash,
            authorName,
            authorEmail,
            date,
            files,
          };
        });

        if (commits.length === 0) {
          continue;
        }

        const latestCommit = commits[0];
        const commitDate = new Date(latestCommit.date);

        for (const { comment, function: funcName } of commentsWithFunctions) {
          const key = `${relativeFilePath}:${funcName}`;
          if (!groupedComments[key]) {
            groupedComments[key] = {
              commitDate,
              author: `${latestCommit.authorName} <${latestCommit.authorEmail}>`,
              file: relativeFilePath,
              function: funcName,
              comments: [],
            };
          }
          groupedComments[key].comments.push(comment);
        }
      }

      progressBar.increment();
    }

    // Clear the dynamic lines and finalize the progress bar
    process.stdout.write("\u001b[3A\u001b[K"); // Move cursor up 3 lines and clear them
    progressBar.stop();
    process.stdout.write("Processing complete.\n");
    rl.close();

    // Prepare and sort output data
    const sortedComments = Object.values(groupedComments).sort(
      (a, b) => b.commitDate - a.commitDate
    );

    // Write to file
    let outputContent = "";
    let title_builder = "";
    let description_builder = "";
    let correct_description = "";
    let correct_title = "";
    function generateTitle(firstFolder, fileNameWithoutExtension) {
      return `${firstFolder} on ${fileNameWithoutExtension}.java`;
    }

    const issueDefinitions = [
      {
        name: "Add Method",
        keywords: ["@#ADD_METHOD"],
        key_container: (match) =>
          `The method ${match}() should be implemented.`,
      },
      {
        name: "Remove Method",
        keywords: ["@#REMOVE_METHOD"],
        key_container: (match) => `The method ${match}() should be removed.`,
      },
      {
        name: "Add Constant",
        keywords: ["@#ADD_CONSTANT"],
        key_container: (match) => `The constant ${match} should be added.`,
      },
      {
        name: "Remove Constant",
        keywords: ["@#REMOVE_CONSTANT"],
        key_container: (match) => `The constant ${match} should be removed.`,
      },
      {
        name: "Fix Bug",
        keywords: ["@#FIX_BUG", "@#END_BUG"],
        key_container: (match) => `Fix the following bug: ${match}.`,
      },
      {
        name: "Improve Performance",
        keywords: ["@#IMPROVE_PERFORMANCE", "@#END_PERFORMANCE"],
        key_container: (match) => `Improve performance: ${match}.`,
      },
      {
        name: "Refactor Code",
        keywords: ["@#REFACTOR_CODE", "@#END_REFACTOR"],
        key_container: (match) => `Refactor the code: ${match}.`,
      },
      {
        name: "Update Dependency",
        keywords: ["@#UPDATE_DEPENDENCY"],
        key_container: (match) => `Update the dependency: ${match}.`,
      },
      {
        name: "Add Documentation",
        keywords: ["@#ADD_DOCUMENTATION", "@#END_DOCUMENTATION"],
        key_container: (match) => `Add documentation: ${match}.`,
      },
      {
        name: "Remove Deprecated",
        keywords: ["@#REMOVE_DEPRECATED", "@#END_DEPRECATED"],
        key_container: (match) => `Remove deprecated code: ${match}.`,
      },
      {
        name: "Handle Error",
        keywords: ["@#HANDLE_ERROR", "@#END_ERROR"],
        key_container: (match) => `Handle the error: ${match}.`,
      },
      {
        name: "Add Test",
        keywords: ["@#ADD_TEST", "@#END_TEST"],
        key_container: (match) => `Add a test case: ${match}.`,
      },
    ];

    function extractDetails(comment, keyword) {
      
      const multilineRegex = new RegExp(`${keyword}\\s+(.*?)\\s+@#END`, "ig");
      const singleLineRegex = new RegExp(`${keyword}\\s+([^(\\s@#)]+)`, "ig");
    
      let details = [];
    
      // Find all multiline matches
      let match;
      
      while ((match = multilineRegex.exec(comment)) !== null) {
        if (match[1].trim()) {
          details.push(match[1].trim());
          console.log("Multiline match:", match[1].trim());
    
          // Remove the matched portion from the comment to prevent reprocessing
          comment = comment.replace(match[0], "");
        }
      }
    
      // Process remaining single-line matches
      while ((match = singleLineRegex.exec(comment)) !== null) {
        if (match[1].trim() && match[1].trim().toLowerCase() !== "null") {
          details.push(match[1].trim());
          console.log("Single-line match:", match[1].trim());
        }
      }
    
      return details.length > 0 ? details : ["Unknown"];
    }
    

    function generateDescription(comments) {
      const detectedIssues = {};
     
      comments.forEach((comment) => {
       
        issueDefinitions.forEach((issue) => {
          if (issue.keywords.some((keyword) => comment.includes(keyword))) {
           
            const details = extractDetails(comment, issue.keywords[0]);
            if (!detectedIssues[issue.name]) {
              detectedIssues[issue.name] = new Set(); // Use a Set to avoid duplicates
            }
            details.forEach((detail) => {
              detectedIssues[issue.name].add(issue.key_container(detail)); // Add details to the Set
            });
          
    
          }
        });
      });
    
      let description = "";
      let issues_keys = "";
    
      if (Object.keys(detectedIssues).length > 0) {
        description += `\nDetected Issues:\n`;
        const issueCounts = {};
    
        Object.entries(detectedIssues).forEach(([issueName, keyContainers]) => {
          keyContainers.forEach((keyContainer) => {
            description += `- ${keyContainer}\n`;
          });
    
          if (!issueCounts[issueName]) {
            issueCounts[issueName] = 0;
          }
          issueCounts[issueName] += keyContainers.size; // Count unique entries
        });
    
        const formattedIssues = Object.entries(issueCounts).map(([key, count]) =>
          count === 1 ? key : `${count} ${key}s`
        );
    
        issues_keys = formattedIssues.join(", ");
      } else {
        description += `\nNo specific issue types detected.`;
      }
    
      return {
        description: description,
        issues: issues_keys,
      };
    }
    
    
    
    

    for (let i = 0; i < sortedComments.length; i++) {
      const data = sortedComments[i];

      const formattedDate = data.commitDate.toLocaleString();

      // Only include Commit, Author, and File headers if this is the first entry or the file is different from the previous
      if (i === 0 || data.file !== sortedComments[i - 1].file) {
        issues_countewr++;

        let boxWidth = 60; // Base box width
        boxWidth = Math.max(boxWidth, data.file.length + 20); // Ensure box is wide enough for the file name

        // Create dynamic horizontal lines
        const horizontalLine = "‾".repeat(boxWidth - 2);
        const bottomLine = "_".repeat(boxWidth - 2);

        // Function to pad or truncate text to fit the box
        const padText = (text, width) => {
          if (text.length > width) {
            return text.slice(0, width - 3) + "..."; // Truncate and add ellipsis if text is too long
          }
          const padding = Math.max(0, width - text.length); // Ensure padding is not negative
          return text + " ".repeat(padding);
        };

        outputContent += ` ${bottomLine}\n`;
        outputContent += `|${padText(
          `Commit: ${formattedDate}`,
          boxWidth - 2
        )}|\n`;
        outputContent += `|${padText(
          `Author: ${data.author}`,
          boxWidth - 2
        )}|\n`;
        outputContent += `|${padText(`File: ${data.file}`, boxWidth - 2)}|\n`;
        outputContent += ` ${horizontalLine}\n\n`;

        const parts = data.file.split(/[/\\]/);
        const firstFolder = parts[0];
        const fileNameWithoutExtension = parts.pop().replace(/\.java$/, "");

        title_builder = generateTitle(firstFolder, fileNameWithoutExtension);
        const dataDesc = generateDescription(data.comments); 
        description_builder = dataDesc.description;
        correct_description = description_builder;
        if (dataDesc.issues !== "") {
          correct_title =
            title_builder + " -> " + dataDesc.issues;
        } else {
          correct_title = title_builder;
        }
          if(issues_countewr === 1){
          await createIssueAPI(correct_title, correct_description);
         } 
      }
      outputContent += `## Issue ID number: ${issues_countewr}\n\n`;
      outputContent += `## Title: ${correct_title}\n\n`;
      outputContent += `## Fast description: ${correct_description}\n\n`;
      outputContent += `\n`;
      outputContent += `## ${data.function}\n`;
      outputContent += `## Comments:\n${data.comments.join("\n")}\n\n`;

      // Add a separator line between functions in the same file
      if (
        i < sortedComments.length - 1 &&
        data.file === sortedComments[i + 1].file
      ) {
        outputContent += "-".repeat(120) + "\n\n";
      }

      // Add separator line only if the next data has a different file name
      if (
        i < sortedComments.length - 1 &&
        data.file !== sortedComments[i + 1].file
      ) {
        const separatorLine = "_".repeat(120); // Adjust separator width
        const verticalSeparator = "|".repeat(120); // Adjust vertical separator width
        const overline = "‾".repeat(120); // Adjust overline width

        outputContent += `${separatorLine}\n`;
        outputContent += `${verticalSeparator}\n`;
        outputContent += `${overline}\n`;
      }
    }

    fs.writeFileSync(outputFilePath, outputContent, "utf8");
    console.log(`Comments collected and saved at ${outputFilePath}`);
    console.log(`Total issues found: ${issues_countewr}`);
  } catch (err) {
    console.error("Error fetching comments:", err);
  }
}

collectComments();
