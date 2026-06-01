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

interface LoginFormProps {
  initialErrorMessage?: string | null;
}

export function LoginForm({ initialErrorMessage = null }: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialErrorMessage);

  return (
    <div className="w-full max-w-sm">
      <motion.div
        key="local-only"
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        <motion.div variants={fadeIn} className="space-y-2 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">本地版无需登录</h2>
          <p className="text-sm text-muted-foreground">
            这个单机版本会直接使用本地工作区，不再需要账号、邮箱或第三方登录。
          </p>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
              aria-live="polite"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          variants={fadeIn}
          className="rounded-2xl border border-border bg-card/70 p-5 text-sm text-muted-foreground"
        >
          直接进入项目列表即可开始使用，本地资料和画布内容会保存到当前机器。
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
            打开本地项目
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            旧的云端登录入口已停用。需要的话可以直接去{" "}
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
