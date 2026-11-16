/**
 * lib/articles.ts — the articles under /articles, newest first. Server side: the pages, sitemap and llms.txt
 * read it. Each article is a file in content/articles/ and is listed here once.
 */
import type { Article } from "./article-types";
import whatIsVerilog from "@/content/articles/what-is-verilog";
import verilogVsVhdl from "@/content/articles/verilog-vs-vhdl";
import blockingVsNonblocking from "@/content/articles/blocking-vs-nonblocking-assignments-in-verilog";
import whatIsAnFpga from "@/content/articles/what-is-an-fpga";
import combVsSeq from "@/content/articles/combinational-vs-sequential-logic";
import simulateVerilog from "@/content/articles/how-to-simulate-verilog-online";
import interviewQuestions from "@/content/articles/verilog-interview-questions";
import fsmInVerilog from "@/content/articles/fsm-in-verilog";
import setupHold from "@/content/articles/setup-and-hold-time";
import asyncFifo from "@/content/articles/async-fifo-design";
import svVsVerilog from "@/content/articles/systemverilog-vs-verilog";

export const ARTICLES: Article[] = [
  interviewQuestions, fsmInVerilog, setupHold, asyncFifo, svVsVerilog,
  whatIsVerilog, verilogVsVhdl, blockingVsNonblocking, whatIsAnFpga, combVsSeq, simulateVerilog,
];

export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug);
export const articleSlugs = () => ARTICLES.map((a) => a.slug);
