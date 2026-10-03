"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  updateAdminUser,
  type AdminUser,
} from "@/lib/api";

import {
  ConfirmModal,
  Field,
  IconBtn,
  ModalShell,
  PrimaryBtn,
  SearchBar,
  StatusBadge,
  inputCls,
  useLoad,
  usePager,
  Sk,
} from "./ui";
import { SelectMenu } from "@/components/wg/ui";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-warning-soft text-warning",
  expert: "bg-[#ede9fe] text-[#7c3aed]",
  researcher: "bg-info-soft text-info",
  user: "bg-brand-50 text-brand-600",
};

export function UsersPage() {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [editing, setEditing] = useState<AdminUser | null | "new">(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    email: string;
  } | null>(null);

  const [deleting, setDeleting] = useState(false);

  const {
    data,
    loading,
    error,
    reload,
  } = useLoad(
    () => fetchAdminUsers(page, 8, q),
    [page, q],
    `admin:users:${page}|${q}`
  );

  const users = data?.users ?? [];
  const total = data?.total ?? 0;

  const { pager } = usePager(
    total,
    8,
    page,
    setPage
  );

  const doSearch = () => {
    setPage(1);
    setQ(search);
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await deleteAdminUser(deleteTarget.id);
      setDeleteTarget(null);
      reload();
    } finally {
      setDeleting(false);
    }
  };

  const handleViewPredictions = (userId: string) => {
    router.push(
      `/admin/users/${userId}/predictions`
    );
  };

  return (
    <div className="space-y-4">

      {/* =========================================================
          TOOLBAR
      ========================================================= */}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">

        <div className="flex items-center gap-2">

          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search users…"
          />

          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-line text-[13px] bg-white hover:bg-surface-muted transition-colors"
            onClick={doSearch}
          >
            Search
          </button>

        </div>

        <PrimaryBtn
          onClick={() => setEditing("new")}
        >
          + Add User
        </PrimaryBtn>

      </div>


      {/* =========================================================
          ERROR
      ========================================================= */}

      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger-soft text-danger text-[13px] border border-[#fca5a5]">
          {error}
        </div>
      )}


      {/* =========================================================
          USERS TABLE
      ========================================================= */}

      <div className="bg-white rounded-xl border border-line overflow-hidden shadow-sm">

        {loading ? (

          <div className="p-5 space-y-3">

            {[1, 2, 3, 4].map((i) => (
              <Sk
                key={i}
                className="h-12"
              />
            ))}

          </div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full text-left text-[13px]">

              {/* TABLE HEADER */}

              <thead className="bg-surface-muted text-muted text-[11px] uppercase">

                <tr>

                  <th className="py-3 px-4 font-semibold tracking-wide">
                    #
                  </th>

                  <th className="py-3 px-4 font-semibold tracking-wide">
                    User
                  </th>

                  <th className="py-3 px-4 font-semibold tracking-wide">
                    Email
                  </th>

                  <th className="py-3 px-4 font-semibold tracking-wide hidden lg:table-cell">
                    Organisation
                  </th>

                  <th className="py-3 px-4 font-semibold tracking-wide">
                    Role
                  </th>

                  <th className="py-3 px-4 font-semibold tracking-wide">
                    Status
                  </th>

                  <th className="py-3 px-4 font-semibold tracking-wide hidden xl:table-cell">
                    Joined
                  </th>

                  <th className="py-3 px-4 font-semibold tracking-wide">
                    Actions
                  </th>

                </tr>

              </thead>


              {/* TABLE BODY */}

              <tbody className="divide-y divide-surface-muted">

                {/* EMPTY STATE */}

                {users.length === 0 && (

                  <tr>

                    <td
                      colSpan={8}
                      className="py-12 text-center"
                    >

                      <span
                        className="material-symbols-outlined text-line block mb-2"
                        style={{ fontSize: 40 }}
                      >
                        group
                      </span>

                      <p className="text-muted text-[14px]">
                        No users found
                      </p>

                    </td>

                  </tr>

                )}


                {/* USERS */}

                {users.map((u, i) => (

                  <tr
                    key={u.id}
                    className="hover:bg-surface-muted transition-colors"
                  >

                    {/* NUMBER */}

                    <td className="py-3 px-4 text-muted">

                      {(page - 1) * 8 + i + 1}

                    </td>


                    {/* USER */}

                    <td className="py-3 px-4">

                      <div className="flex items-center gap-2.5">

                        {u.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt={u.name}
                            className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-brand-100"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-brand-900 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                            {u.initials}
                          </div>
                        )}

                        <span className="font-semibold text-ink">

                          {u.name}

                        </span>

                      </div>

                    </td>


                    {/* EMAIL */}

                    <td className="py-3 px-4 text-muted">

                      {u.email}

                    </td>


                    {/* ORGANISATION */}

                    <td className="py-3 px-4 text-muted hidden lg:table-cell">

                      {u.organization
                        ? <span className="truncate max-w-[140px] inline-block">{u.organization}</span>
                        : <span className="text-line">—</span>
                      }

                    </td>


                    {/* ROLE */}

                    <td className="py-3 px-4">

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                          ROLE_COLORS[u.role] ??
                          "bg-surface-muted text-muted"
                        }`}
                      >

                        {u.role}

                      </span>

                    </td>


                    {/* STATUS */}

                    <td className="py-3 px-4">

                      <StatusBadge
                        value={u.status}
                      />

                    </td>


                    {/* JOINED */}

                    <td className="py-3 px-4 text-muted text-[12px] hidden xl:table-cell whitespace-nowrap">

                      {u.created_at
                        ? new Date(u.created_at).toLocaleDateString(undefined, {
                            year: "numeric", month: "short", day: "numeric",
                          })
                        : "—"
                      }

                    </td>


                    {/* ACTIONS */}

                    <td className="py-3 px-4">

                      <div className="flex items-center gap-1">

                        {/* =================================================
                            VIEW PREDICTIONS
                        ================================================= */}

                        <button
                          type="button"
                          onClick={() =>
                            handleViewPredictions(u.id)
                          }
                          className="p-1.5 rounded-lg text-brand-900 hover:bg-brand-100 transition-colors"
                          title="View Predictions"
                          aria-label={`View predictions for ${u.name}`}
                        >

                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 17 }}
                          >
                            analytics
                          </span>

                        </button>


                        {/* =================================================
                            EDIT USER
                        ================================================= */}

                        <IconBtn
                          icon="edit"
                          title="Edit"
                          onClick={() =>
                            setEditing(u)
                          }
                        />


                        {/* =================================================
                            DELETE USER
                        ================================================= */}

                        <IconBtn
                          icon="delete"
                          title="Delete"
                          danger
                          onClick={() =>
                            setDeleteTarget({
                              id: u.id,
                              email: u.email,
                            })
                          }
                        />


                        {/* =================================================
                            SEND EMAIL
                        ================================================= */}

                        <a
                          href={`mailto:${u.email}`}
                          className="p-1.5 rounded-lg text-info hover:bg-info-soft transition-colors"
                          title="Send email"
                          aria-label={`Send email to ${u.email}`}
                        >

                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 17 }}
                          >
                            mail
                          </span>

                        </a>

                      </div>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}


        {/* =========================================================
            PAGINATION
        ========================================================= */}

        <div className="px-5 pb-4">
          {pager}
        </div>

      </div>


      {/* =========================================================
          DELETE CONFIRMATION
      ========================================================= */}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete user"
        message={`Are you sure you want to delete ${
          deleteTarget?.email ?? "this user"
        }? This action cannot be undone.`}
        onConfirm={handleDeleteConfirmed}
        busy={deleting}
        onCancel={() =>
          setDeleteTarget(null)
        }
        centered
      />


      {/* =========================================================
          ADD / EDIT USER MODAL
      ========================================================= */}

      {editing && (

        <UserModal
          user={
            editing === "new"
              ? null
              : editing
          }
          onClose={() =>
            setEditing(null)
          }
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />

      )}

    </div>
  );
}


/* ===============================================================
   USER MODAL
================================================================ */

function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {

  const [name, setName] = useState(
    user?.name ?? ""
  );

  const [email, setEmail] = useState(
    user?.email ?? ""
  );

  const [role, setRole] = useState(
    user?.role ?? "user"
  );

  const [status, setStatus] = useState(
    user?.status ?? "active"
  );

  const [password, setPassword] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [err, setErr] =
    useState("");


  const save = async () => {

    setBusy(true);
    setErr("");

    try {

      if (user) {

        await updateAdminUser(
          user.id,
          {
            name,
            email,
            role,
            status,
          }
        );

      } else {

        await createAdminUser({
          name,
          email,
          role,
          status,
          password:
            password || undefined,
        });

      }

      onSaved();

    } catch (e) {

      setErr(
        e instanceof Error
          ? e.message
          : "Save failed"
      );

    } finally {

      setBusy(false);

    }
  };


  return (

    <ModalShell
      title={
        user
          ? "Edit User"
          : "Add User"
      }
      onClose={onClose}
      centered
    >

      {/* AVATAR PREVIEW (edit mode only) */}

      {user && (
        <div className="flex items-center gap-3 pb-4 border-b border-surface-muted mb-2">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-12 h-12 rounded-full object-cover ring-2 ring-brand-100 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-brand-900 text-white flex items-center justify-center text-[13px] font-bold shrink-0">
              {user.initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink truncate">{user.name}</p>
            <p className="text-[12px] text-muted truncate">{user.email}</p>
          </div>
        </div>
      )}

      {/* FULL NAME */}

      <Field label="Full Name">

        <input
          className={inputCls}
          value={name}
          onChange={(e) =>
            setName(e.target.value)
          }
          placeholder="John Doe"
        />

      </Field>


      {/* EMAIL */}

      <Field label="Email Address">

        <input
          className={inputCls}
          type="email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          placeholder="user@example.com"
        />

      </Field>


      {/* ROLE + STATUS */}

      <div className="grid grid-cols-2 gap-4">

        <Field label="Role">

          <SelectMenu
            ariaLabel="Role"
            className="w-full"
            value={role}
            onChange={(v) => setRole(v)}
            options={[
              { value: "admin", label: "Admin" },
              { value: "expert", label: "Expert" },
              { value: "researcher", label: "Researcher" },
              { value: "user", label: "User" },
            ]}
          />

        </Field>


        <Field label="Status">

          <SelectMenu
            ariaLabel="Status"
            className="w-full"
            value={status}
            onChange={(v) => setStatus(v)}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />

        </Field>

      </div>


      {/* PASSWORD */}

      {!user && (

        <Field label="Password (optional)">

          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            placeholder="Leave blank for auto-generated"
          />

        </Field>

      )}


      {/* ERROR */}

      {err && (

        <p className="text-[13px] text-danger mb-3">

          {err}

        </p>

      )}


      {/* BUTTONS */}

      <div className="flex justify-end gap-2 pt-2">

        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-line text-[13px] hover:bg-surface-muted transition-colors"
        >
          Cancel
        </button>


        <PrimaryBtn
          disabled={
            busy ||
            !name.trim() ||
            !email.trim()
          }
          onClick={save}
        >

          {busy
            ? "Saving…"
            : user
            ? "Update User"
            : "Create User"}

        </PrimaryBtn>

      </div>

    </ModalShell>

  );
}