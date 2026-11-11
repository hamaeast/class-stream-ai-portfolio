import { useEffect, useState } from "react";
import { Link2, Plus, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { usePreview } from "@/lib/PreviewContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

export default function Links() {
  const { toast } = useToast();
  const { previewStudent } = usePreview();
  const [user, setUser] = useState(null);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", url: "", description: "" });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // Admins manage links; while previewing a student the teacher sees the student view.
  const isAdmin = !!user && user.role === "admin" && !previewStudent;

  const load = async () => {
    try {
      const rows = await base44.entities.ResourceLink.list("-created_date", 200);
      setLinks(rows);
    } catch {
      toast({ title: "Could not load links", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onAdd = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      await base44.entities.ResourceLink.create({
        title: form.title.trim(),
        url: form.url.trim(),
        description: form.description.trim()
      });
      setForm({ title: "", url: "", description: "" });
      await load();
      toast({ title: "Link added" });
    } catch {
      toast({ title: "Could not add link", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    try {
      await base44.entities.ResourceLink.delete(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
      toast({ title: "Link removed for everyone" });
    } catch {
      toast({ title: "Could not delete link", variant: "destructive" });
    }
  };

  const normalizeUrl = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Links</h1>
        <p className="text-stone-400 text-sm mt-1">Curated resources from your teacher.</p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> Add a link
            </CardTitle>
            <CardDescription>Share a new resource with all students.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onAdd} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input
                  placeholder="Title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
                <Input
                  placeholder="https://example.com"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  required
                />
              </div>
              <Textarea
                placeholder="Description (optional)"
                value={form.description}
                rows={2}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={saving || !form.title.trim() || !form.url.trim()}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add link"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
        </div>
      ) : links.length === 0 ? (
        <p className="text-center text-stone-500 py-12">No links yet.</p>
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <Card key={l.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Link2 className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <a
                      href={normalizeUrl(l.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-display font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      {l.title}
                      <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                    </a>
                    {l.description && (
                      <p className="text-sm text-stone-400 mt-1 whitespace-pre-wrap">{l.description}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-stone-400 hover:text-destructive shrink-0"
                      onClick={() => onDelete(l.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}