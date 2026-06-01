"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "./ui/button";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
} as const;

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
} as const;

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="w-full max-w-sm">
      <motion.div
        key="register-disabled"
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        <motion.div variants={fadeIn} className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">本地版不创建账号</h2>
          <p className="text-sm text-muted-foreground">
            单机版会直接为当前设备准备本地工作区，不再需要注册、邮箱确认或密码。
          </p>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden text-center text-sm text-destructive"
              role="alert"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.div
          variants={fadeIn}
          className="rounded-2xl border border-border bg-card/70 p-5 text-sm text-muted-foreground"
        >
          点击下面的按钮即可进入本地项目列表，所有资料会保存在当前机器的 SQLite 和本地文件目录中。
        </motion.div>

        <motion.div variants={fadeIn} className="space-y-3">
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              setError(null);
              router.replace("/projects");
            }}
          >
            进入本地项目
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            如果你是从旧入口来到这里，可以直接回到{" "}
            <Link href="/projects" className="underline underline-offset-4">
              项目页
            </Link>
            。
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
