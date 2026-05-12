"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { SimulationNodeDatum } from "d3";
import { BookIcon, CodeIcon, NetworkIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type GraphNode = SimulationNodeDatum & {
  id: string;
  name?: string;
  title?: string;
  type: keyof typeof TYPE_COLORS;
};

type GraphLink = {
  source: GraphNode | string;
  target: GraphNode | string;
  type: string;
};

const rawData = {
  branches: [
    { id: "branch_central", name: "中央图书馆", maxBorrowPerReader: 3, newBookProtectionDays: 7, allowInterLibraryLoan: true, type: "Branch" },
    { id: "branch_west", name: "西区分馆", maxBorrowPerReader: 3, newBookProtectionDays: 7, allowInterLibraryLoan: true, type: "Branch" },
  ],
  categories: [
    { id: "cat_science", name: "自然科学", isRestricted: true, requiredMembershipLevel: "gold", type: "Category" },
    { id: "cat_fiction", name: "文学虚构", isRestricted: false, requiredMembershipLevel: "basic", type: "Category" },
    { id: "cat_history", name: "历史人文", isRestricted: false, requiredMembershipLevel: "basic", type: "Category" },
  ],
  authors: [
    { id: "author_liu", name: "刘慈欣", nationality: "中国", activeBookCount: 4, type: "Author" },
    { id: "author_rowling", name: "J.K.罗琳", nationality: "英国", activeBookCount: 3, type: "Author" },
    { id: "author_harari", name: "尤瓦尔·赫拉利", nationality: "以色列", activeBookCount: 1, type: "Author" },
  ],
  series: [
    { id: "series_three_body", name: "三体三部曲", totalVolumes: 3, type: "Series" },
    { id: "series_hp", name: "哈利波特", totalVolumes: 7, type: "Series" },
  ],
  books: [
    { id: "book_tb1", title: "三体（第一部）", isbn: "978-7-229-03093-3", daysOnShelf: 100, totalCopies: 4, availableCopies: 1, seriesVolume: 1, type: "Book" },
    { id: "book_tb2", title: "三体·黑暗森林（第二部）", isbn: "978-7-229-03094-0", daysOnShelf: 80, totalCopies: 3, availableCopies: 0, seriesVolume: 2, type: "Book" },
    { id: "book_tb3", title: "三体·死神永生（第三部）", isbn: "978-7-229-03095-7", daysOnShelf: 50, totalCopies: 2, availableCopies: 2, seriesVolume: 3, type: "Book" },
    { id: "book_hp1", title: "哈利·波特与魔法石", isbn: "978-7-5327-4356-2", daysOnShelf: 300, totalCopies: 4, availableCopies: 2, seriesVolume: 1, type: "Book" },
    { id: "book_hp2", title: "哈利·波特与密室", isbn: "978-7-5327-4357-9", daysOnShelf: 200, totalCopies: 2, availableCopies: 0, seriesVolume: 2, type: "Book" },
    { id: "book_hp3", title: "哈利·波特与阿兹卡班的囚徒", isbn: "978-7-5327-4358-6", daysOnShelf: 5, totalCopies: 2, availableCopies: 1, seriesVolume: 3, type: "Book" },
    { id: "book_quantum", title: "量子纠缠导论", isbn: "978-7-03-061234-8", daysOnShelf: 2, totalCopies: 1, availableCopies: 1, seriesVolume: 0, type: "Book" },
    { id: "book_sapiens", title: "人类简史", isbn: "978-0-06-231609-7", daysOnShelf: 90, totalCopies: 5, availableCopies: 3, seriesVolume: 0, type: "Book" },
    { id: "book_cosmos", title: "宇宙的奇迹", isbn: "978-7-5327-9876-3", daysOnShelf: 120, totalCopies: 2, availableCopies: 2, seriesVolume: 0, type: "Book" },
  ],
  readers: [
    { id: "xiao_ming", name: "小明", membershipLevel: "gold", currentBorrowCount: 2, registeredDays: 365, type: "Reader" },
    { id: "xiao_hong", name: "小红", membershipLevel: "basic", currentBorrowCount: 0, registeredDays: 30, type: "Reader" },
    { id: "lao_wang", name: "老王", membershipLevel: "silver", currentBorrowCount: 3, registeredDays: 720, type: "Reader" },
    { id: "xiao_li", name: "小李", membershipLevel: "gold", currentBorrowCount: 1, registeredDays: 180, type: "Reader" },
    { id: "user_a", name: "用户A", type: "Reader" },
    { id: "user_b", name: "用户B", type: "Reader" },
  ],
  relations: [
    { from: "branch_central", to: "branch_west", type: "partners_with" },
    { from: "branch_west", to: "branch_central", type: "partners_with" },
    { from: "author_liu", to: "cat_science", type: "specializes_in" },
    { from: "author_rowling", to: "cat_fiction", type: "specializes_in" },
    { from: "author_harari", to: "cat_history", type: "specializes_in" },
    { from: "book_cosmos", to: "author_harari", type: "written_by" },
    { from: "book_cosmos", to: "cat_history", type: "belongs_to" },
    { from: "book_cosmos", to: "branch_central", type: "available_at" },
    { from: "book_tb1", to: "author_liu", type: "written_by" },
    { from: "book_tb2", to: "author_liu", type: "written_by" },
    { from: "book_tb3", to: "author_liu", type: "written_by" },
    { from: "book_quantum", to: "author_liu", type: "written_by" },
    { from: "book_hp1", to: "author_rowling", type: "written_by" },
    { from: "book_hp2", to: "author_rowling", type: "written_by" },
    { from: "book_hp3", to: "author_rowling", type: "written_by" },
    { from: "book_sapiens", to: "author_harari", type: "written_by" },
    { from: "book_tb1", to: "cat_science", type: "belongs_to" },
    { from: "book_tb2", to: "cat_science", type: "belongs_to" },
    { from: "book_tb3", to: "cat_science", type: "belongs_to" },
    { from: "book_quantum", to: "cat_science", type: "belongs_to" },
    { from: "book_hp1", to: "cat_fiction", type: "belongs_to" },
    { from: "book_hp2", to: "cat_fiction", type: "belongs_to" },
    { from: "book_hp3", to: "cat_fiction", type: "belongs_to" },
    { from: "book_sapiens", to: "cat_history", type: "belongs_to" },
    { from: "book_tb1", to: "series_three_body", type: "part_of" },
    { from: "book_tb2", to: "series_three_body", type: "part_of" },
    { from: "book_tb3", to: "series_three_body", type: "part_of" },
    { from: "book_hp1", to: "series_hp", type: "part_of" },
    { from: "book_hp2", to: "series_hp", type: "part_of" },
    { from: "book_hp3", to: "series_hp", type: "part_of" },
    { from: "book_tb1", to: "branch_central", type: "available_at" },
    { from: "book_tb1", to: "branch_west", type: "available_at" },
    { from: "book_tb2", to: "branch_central", type: "available_at" },
    { from: "book_tb3", to: "branch_west", type: "available_at" },
    { from: "book_hp1", to: "branch_central", type: "available_at" },
    { from: "book_hp1", to: "branch_west", type: "available_at" },
    { from: "book_hp2", to: "branch_central", type: "available_at" },
    { from: "book_hp3", to: "branch_west", type: "available_at" },
    { from: "book_quantum", to: "branch_central", type: "available_at" },
    { from: "book_sapiens", to: "branch_central", type: "available_at" },
    { from: "book_sapiens", to: "branch_west", type: "available_at" },
    { from: "xiao_ming", to: "branch_central", type: "registered_at" },
    { from: "xiao_hong", to: "branch_west", type: "registered_at" },
    { from: "lao_wang", to: "branch_central", type: "registered_at" },
    { from: "xiao_li", to: "branch_west", type: "registered_at" },
    { from: "xiao_ming", to: "book_tb1", type: "borrows" },
    { from: "xiao_ming", to: "book_tb2", type: "borrows" },
    { from: "lao_wang", to: "book_hp1", type: "borrows" },
    { from: "lao_wang", to: "book_sapiens", type: "borrows" },
    { from: "lao_wang", to: "book_tb1", type: "borrows" },
    { from: "xiao_li", to: "book_hp1", type: "borrows" },
    { from: "xiao_li", to: "book_hp2", type: "overdue" },
    { from: "xiao_hong", to: "book_hp3", type: "reserves" },
    { from: "xiao_ming", to: "book_hp3", type: "reserves" },
    { from: "lao_wang", to: "book_hp3", type: "reserves" },
    { from: "xiao_li", to: "book_hp3", type: "reserves" },
    { from: "user_a", to: "book_hp3", type: "reserves" },
    { from: "user_b", to: "book_hp3", type: "reserves" },
  ],
};

const TYPE_COLORS: Record<string, string> = {
  Branch: "#3b82f6",
  Category: "#a855f7",
  Author: "#f97316",
  Series: "#10b981",
  Book: "#ef4444",
  Reader: "#06b6d4",
};

const RELATION_LABELS: Record<string, string> = {
  partners_with: "合作伙伴",
  specializes_in: "擅长类目",
  written_by: "作者",
  belongs_to: "所属类目",
  part_of: "所属系列",
  available_at: "库存于",
  registered_at: "注册于",
  borrows: "借阅中",
  overdue: "逾期未还",
  reserves: "预约",
};

function LibraryGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<{ source: GraphNode; target: GraphNode; type: string } | null>(null);
  const [hoveredLink, setHoveredLink] = useState<{ source: { x: number; y: number }; target: { x: number; y: number }; type: string } | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const nodes: GraphNode[] = [
      ...rawData.branches,
      ...rawData.categories,
      ...rawData.authors,
      ...rawData.series,
      ...rawData.books,
      ...rawData.readers,
    ].map(n => ({ ...n })) as GraphNode[];

    const links: GraphLink[] = rawData.relations.map(r => ({
      source: r.from,
      target: r.to,
      type: r.type,
    }));

    const width = window.innerWidth - 320;
    const height = window.innerHeight - 100;

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    svg.selectAll("*").remove();

    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "-0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("xoverflow", "visible")
      .append("svg:path")
      .attr("d", "M 0,-5 L 10 ,0 L 0,5")
      .attr("fill", "#999")
      .style("stroke", "none");

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40));

    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", d => d.type === "overdue" ? "#dc2626" : "#94a3b8")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", d => d.type === "overdue" ? 3 : 1.5)
      .attr("stroke-dasharray", d => d.type === "reserves" ? "4 2" : "none")
      .attr("marker-end", "url(#arrowhead)")
      .attr("class", "cursor-pointer transition-all hover:stroke-blue-400")
      .on("mouseenter", (_, d) => {
        const sourceNode = d.source as GraphNode;
        const targetNode = d.target as GraphNode;
        setHoveredLink({ source: { x: sourceNode.x ?? 0, y: sourceNode.y ?? 0 }, target: { x: targetNode.x ?? 0, y: targetNode.y ?? 0 }, type: d.type });
      })
      .on("mouseleave", () => setHoveredLink(null))
      .on("click", (e, d) => {
        e.stopPropagation();
        setSelectedLink({ source: d.source as GraphNode, target: d.target as GraphNode, type: d.type });
        setSelectedNode(null);
      });

    const node = svg.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g");

    node.call(
      d3.drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    node.on("click", (e, d) => {
      e.stopPropagation();
      setSelectedNode(d);
      setSelectedLink(null);
    });

    svg.on("click", () => {
      setSelectedNode(null);
      setSelectedLink(null);
    });

    node.append("circle")
      .attr("r", 12)
      .attr("fill", d => TYPE_COLORS[d.type] || "#ccc")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("class", "cursor-pointer transition-all hover:r-15");

    node.append("text")
      .text(d => d.name ?? d.title ?? "")
      .attr("x", 16)
      .attr("y", 4)
      .style("font-size", "10px")
      .style("font-family", "Inter, sans-serif")
      .style("pointer-events", "none")
      .attr("fill", "#334155");

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as GraphNode).x ?? 0)
        .attr("y1", d => (d.source as GraphNode).y ?? 0)
        .attr("x2", d => (d.target as GraphNode).x ?? 0)
        .attr("y2", d => (d.target as GraphNode).y ?? 0)
        .attr("stroke", d => {
          if (selectedLink && d.source === selectedLink.source && d.target === selectedLink.target) return "#f59e0b";
          return d.type === "overdue" ? "#dc2626" : "#94a3b8";
        })
        .attr("stroke-width", d => {
          if (selectedLink && d.source === selectedLink.source && d.target === selectedLink.target) return 4;
          return d.type === "overdue" ? 3 : 1.5;
        })
        .attr("stroke-opacity", d => (selectedLink && !(d.source === selectedLink.source && d.target === selectedLink.target)) ? 0.2 : 0.8);

      node.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`)
        .attr("opacity", d => (selectedLink ? 0.4 : 1));
    });

    return () => {
      simulation.stop();
    };
  }, [selectedLink]);

  return (
    <div className="flex h-full bg-slate-50 font-sans overflow-hidden">
      <div className="flex-1 relative cursor-move">
        {/* 图例面板 - 放在 relative 容器内部 */}
        <div className="absolute top-2 left-2 z-10 bg-white/80 backdrop-blur p-2 rounded-lg shadow-sm border border-slate-200">
          <h3 className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">实体类型</h3>
          <div className="space-y-1">
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-slate-700">{type}</span>
              </div>
            ))}
          </div>
        </div>

        <svg ref={svgRef} className="w-full h-full" />

        {hoveredLink && (
          <div
            className="absolute bg-slate-800 text-white px-2 py-1 rounded text-[10px] pointer-events-none"
            style={{
              left: (hoveredLink.source.x + hoveredLink.target.x) / 2,
              top: (hoveredLink.source.y + hoveredLink.target.y) / 2,
            }}
          >
            {RELATION_LABELS[hoveredLink.type] || hoveredLink.type}
          </div>
        )}
      </div>

      <div className="w-64 bg-white border-l border-slate-200 p-4 overflow-y-auto">
        {selectedNode ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase" style={{ backgroundColor: TYPE_COLORS[selectedNode.type] }}>
                {selectedNode.type}
              </span>
              <span className="text-xs text-slate-400">ID: {selectedNode.id}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-4">{selectedNode.name ?? selectedNode.title ?? ""}</h2>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(selectedNode).map(([key, value]) => {
                if (["id", "type", "index", "x", "y", "vx", "vy", "fx", "fy", "name", "title"].includes(key)) return null;
                return (
                  <div key={key} className="bg-slate-50 p-2 rounded border border-slate-100">
                    <div className="text-[10px] text-slate-500 uppercase">{key}</div>
                    <div className="text-sm font-medium text-slate-800">{String(value)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : selectedLink ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white uppercase">
                Relationship
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              {RELATION_LABELS[selectedLink.type] || selectedLink.type}
            </h2>
            <p className="text-xs text-slate-500 mb-4">连接两个实体的逻辑关联</p>

            <div className="space-y-4">
              <div className="relative pl-4 border-l-2 border-slate-100 space-y-4">
                <div className="relative">
                  <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-slate-300 border-2 border-white shadow-sm" />
                  <div className="text-[10px] text-slate-400 uppercase font-bold">From (源节点)</div>
                  <div className="text-sm font-semibold text-slate-700">{selectedLink.source.name ?? selectedLink.source.title}</div>
                  <div className="text-[10px] text-slate-400 italic">{selectedLink.source.type}</div>
                </div>

                <div className="relative">
                  <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white shadow-sm" />
                  <div className="text-[10px] text-slate-400 uppercase font-bold">To (目标节点)</div>
                  <div className="text-sm font-semibold text-slate-700">{selectedLink.target.name ?? selectedLink.target.title}</div>
                  <div className="text-[10px] text-slate-400 italic">{selectedLink.target.type}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-1">关系说明</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  此关系定义了 <b>{selectedLink.source.name ?? selectedLink.source.title}</b> 与 <b>{selectedLink.target.name ?? selectedLink.target.title}</b> 之间的
                  <span className="text-amber-600 font-medium"> {RELATION_LABELS[selectedLink.type]} </span>
                  绑定。
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 text-center">
            <svg className="w-10 h-10 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs italic">点击图中的节点或连线<br />查看详细关系与属性</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DataSource() {
  // const dataString = JSON.stringify(rawData, null, 2);
  const dataString = `const rawData = {
  branches: [
    { id: "branch_central", name: "中央图书馆", maxBorrowPerReader: 3, newBookProtectionDays: 7, allowInterLibraryLoan: true, type: "Branch" },
    { id: "branch_west", name: "西区分馆", maxBorrowPerReader: 3, newBookProtectionDays: 7, allowInterLibraryLoan: true, type: "Branch" },
  ],
  categories: [
    { id: "cat_science", name: "自然科学", isRestricted: true, requiredMembershipLevel: "gold", type: "Category" },
    { id: "cat_fiction", name: "文学虚构", isRestricted: false, requiredMembershipLevel: "basic", type: "Category" },
    { id: "cat_history", name: "历史人文", isRestricted: false, requiredMembershipLevel: "basic", type: "Category" },
  ],
  authors: [
    { id: "author_liu", name: "刘慈欣", nationality: "中国", activeBookCount: 4, type: "Author" },
    { id: "author_rowling", name: "J.K.罗琳", nationality: "英国", activeBookCount: 3, type: "Author" },
    { id: "author_harari", name: "尤瓦尔·赫拉利", nationality: "以色列", activeBookCount: 1, type: "Author" },
  ],
  series: [
    { id: "series_three_body", name: "三体三部曲", totalVolumes: 3, type: "Series" },
    { id: "series_hp", name: "哈利波特", totalVolumes: 7, type: "Series" },
  ],
  books: [
    { id: "book_tb1", title: "三体（第一部）", isbn: "978-7-229-03093-3", daysOnShelf: 100, totalCopies: 4, availableCopies: 1, seriesVolume: 1, type: "Book" },
    { id: "book_tb2", title: "三体·黑暗森林（第二部）", isbn: "978-7-229-03094-0", daysOnShelf: 80, totalCopies: 3, availableCopies: 0, seriesVolume: 2, type: "Book" },
    { id: "book_tb3", title: "三体·死神永生（第三部）", isbn: "978-7-229-03095-7", daysOnShelf: 50, totalCopies: 2, availableCopies: 2, seriesVolume: 3, type: "Book" },
    { id: "book_hp1", title: "哈利·波特与魔法石", isbn: "978-7-5327-4356-2", daysOnShelf: 300, totalCopies: 4, availableCopies: 2, seriesVolume: 1, type: "Book" },
    { id: "book_hp2", title: "哈利·波特与密室", isbn: "978-7-5327-4357-9", daysOnShelf: 200, totalCopies: 2, availableCopies: 0, seriesVolume: 2, type: "Book" },
    { id: "book_hp3", title: "哈利·波特与阿兹卡班的囚徒", isbn: "978-7-5327-4358-6", daysOnShelf: 5, totalCopies: 2, availableCopies: 1, seriesVolume: 3, type: "Book" },
    { id: "book_quantum", title: "量子纠缠导论", isbn: "978-7-03-061234-8", daysOnShelf: 2, totalCopies: 1, availableCopies: 1, seriesVolume: 0, type: "Book" },
    { id: "book_sapiens", title: "人类简史", isbn: "978-0-06-231609-7", daysOnShelf: 90, totalCopies: 5, availableCopies: 3, seriesVolume: 0, type: "Book" },
    { id: "book_cosmos", title: "宇宙的奇迹", isbn: "978-7-5327-9876-3", daysOnShelf: 120, totalCopies: 2, availableCopies: 2, seriesVolume: 0, type: "Book" },
  ],
  readers: [
    { id: "xiao_ming", name: "小明", membershipLevel: "gold", currentBorrowCount: 2, registeredDays: 365, type: "Reader" },
    { id: "xiao_hong", name: "小红", membershipLevel: "basic", currentBorrowCount: 0, registeredDays: 30, type: "Reader" },
    { id: "lao_wang", name: "老王", membershipLevel: "silver", currentBorrowCount: 3, registeredDays: 720, type: "Reader" },
    { id: "xiao_li", name: "小李", membershipLevel: "gold", currentBorrowCount: 1, registeredDays: 180, type: "Reader" },
    { id: "user_a", name: "用户A", type: "Reader" },
    { id: "user_b", name: "用户B", type: "Reader" },
  ],
  relations: [
    { from: "branch_central", to: "branch_west", type: "partners_with" },
    { from: "branch_west", to: "branch_central", type: "partners_with" },
    { from: "author_liu", to: "cat_science", type: "specializes_in" },
    { from: "author_rowling", to: "cat_fiction", type: "specializes_in" },
    { from: "author_harari", to: "cat_history", type: "specializes_in" },
    { from: "book_cosmos", to: "author_harari", type: "written_by" },
    { from: "book_cosmos", to: "cat_history", type: "belongs_to" },
    { from: "book_cosmos", to: "branch_central", type: "available_at" },
    { from: "book_tb1", to: "author_liu", type: "written_by" },
    { from: "book_tb2", to: "author_liu", type: "written_by" },
    { from: "book_tb3", to: "author_liu", type: "written_by" },
    { from: "book_quantum", to: "author_liu", type: "written_by" },
    { from: "book_hp1", to: "author_rowling", type: "written_by" },
    { from: "book_hp2", to: "author_rowling", type: "written_by" },
    { from: "book_hp3", to: "author_rowling", type: "written_by" },
    { from: "book_sapiens", to: "author_harari", type: "written_by" },
    { from: "book_tb1", to: "cat_science", type: "belongs_to" },
    { from: "book_tb2", to: "cat_science", type: "belongs_to" },
    { from: "book_tb3", to: "cat_science", type: "belongs_to" },
    { from: "book_quantum", to: "cat_science", type: "belongs_to" },
    { from: "book_hp1", to: "cat_fiction", type: "belongs_to" },
    { from: "book_hp2", to: "cat_fiction", type: "belongs_to" },
    { from: "book_hp3", to: "cat_fiction", type: "belongs_to" },
    { from: "book_sapiens", to: "cat_history", type: "belongs_to" },
    { from: "book_tb1", to: "series_three_body", type: "part_of" },
    { from: "book_tb2", to: "series_three_body", type: "part_of" },
    { from: "book_tb3", to: "series_three_body", type: "part_of" },
    { from: "book_hp1", to: "series_hp", type: "part_of" },
    { from: "book_hp2", to: "series_hp", type: "part_of" },
    { from: "book_hp3", to: "series_hp", type: "part_of" },
    { from: "book_tb1", to: "branch_central", type: "available_at" },
    { from: "book_tb1", to: "branch_west", type: "available_at" },
    { from: "book_tb2", to: "branch_central", type: "available_at" },
    { from: "book_tb3", to: "branch_west", type: "available_at" },
    { from: "book_hp1", to: "branch_central", type: "available_at" },
    { from: "book_hp1", to: "branch_west", type: "available_at" },
    { from: "book_hp2", to: "branch_central", type: "available_at" },
    { from: "book_hp3", to: "branch_west", type: "available_at" },
    { from: "book_quantum", to: "branch_central", type: "available_at" },
    { from: "book_sapiens", to: "branch_central", type: "available_at" },
    { from: "book_sapiens", to: "branch_west", type: "available_at" },
    { from: "xiao_ming", to: "branch_central", type: "registered_at" },
    { from: "xiao_hong", to: "branch_west", type: "registered_at" },
    { from: "lao_wang", to: "branch_central", type: "registered_at" },
    { from: "xiao_li", to: "branch_west", type: "registered_at" },
    { from: "xiao_ming", to: "book_tb1", type: "borrows" },
    { from: "xiao_ming", to: "book_tb2", type: "borrows" },
    { from: "lao_wang", to: "book_hp1", type: "borrows" },
    { from: "lao_wang", to: "book_sapiens", type: "borrows" },
    { from: "lao_wang", to: "book_tb1", type: "borrows" },
    { from: "xiao_li", to: "book_hp1", type: "borrows" },
    { from: "xiao_li", to: "book_hp2", type: "overdue" },
    { from: "xiao_hong", to: "book_hp3", type: "reserves" },
    { from: "xiao_ming", to: "book_hp3", type: "reserves" },
    { from: "lao_wang", to: "book_hp3", type: "reserves" },
    { from: "xiao_li", to: "book_hp3", type: "reserves" },
    { from: "user_a", to: "book_hp3", type: "reserves" },
    { from: "user_b", to: "book_hp3", type: "reserves" },
  ],
};
`

  return (
    <div className="h-[calc(100vh-80px)] overflow-auto bg-slate-900 p-4">
      <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap">{dataString}</pre>
    </div>
  );
}

export default function LibraryGraphPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <NetworkIcon className="size-4 mr-2" />
              返回首页
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <BookIcon className="size-5" />
            <h1 className="text-lg font-semibold">图书馆知识图谱</h1>
          </div>
        </div>
      </header>

      <Tabs defaultValue="graph" className="flex flex-col w-full h-[calc(100vh-56px)]">
        <div className="border-b bg-background/95 backdrop-blur px-4">
          <TabsList className="bg-transparent">
            <TabsTrigger value="graph">
              <NetworkIcon className="size-4 mr-2" />
              图谱可视化
            </TabsTrigger>
            <TabsTrigger value="source">
              <CodeIcon className="size-4 mr-2" />
              数据源代码
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="graph" className="m-0 flex-1 overflow-hidden">
          <LibraryGraph />
        </TabsContent>

        <TabsContent value="source" className="m-0 flex-1 overflow-hidden">
          <DataSource />
        </TabsContent>
      </Tabs>
    </div>
  );
}