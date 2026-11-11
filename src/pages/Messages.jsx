import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import TeacherMessages from "@/components/TeacherMessages";
import StudentMessageList from "@/components/StudentMessageList";
import CodeHeader from "@/components/CodeHeader";
import { Loader2 } from "lucide-react";

export default function Messages() {
  const [user, setUser] = useState(null);
  const [students, setStudents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
      if (me?.role === "admin") {
        const [us, msgs] = await Promise.all([
          base44.entities.User.list(),
          base44.entities.Message.list("-created_date"),
        ]);
        setStudents((us || []).filter((u) => u.role !== "admin"));
        setMessages(msgs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Only re-fetch messages after a send/delete — the student list is unchanged.
  const reloadMessages = async () => {
    try {
      const msgs = await base44.entities.Message.list("-created_date");
      setMessages(msgs || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  if (user?.role === "admin") {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <CodeHeader chip="messages.broadcast()" title="Messages" subtitle="Send messages to students and manage sent records." />
        <TeacherMessages students={students} messages={messages} onRefresh={reloadMessages} />
      </div>
    );
  }

  return user ? <StudentMessageList user={user} /> : null;
}