type Member = { id: string; name: string };
type Contact = { name: string; phone: string | null; email: string | null; source: string | null; tags: string[]; ownerId: string | null };

export function ContactFields({ members, contact }: { members: Member[]; contact?: Contact }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Nome</label>
        <input className="input" name="name" required defaultValue={contact?.name} />
      </div>
      <div>
        <label className="label">WhatsApp / telefone</label>
        <input className="input" name="phone" placeholder="5511999990000" defaultValue={contact?.phone ?? ""} />
      </div>
      <div>
        <label className="label">E-mail</label>
        <input className="input" name="email" type="email" defaultValue={contact?.email ?? ""} />
      </div>
      <div>
        <label className="label">Origem</label>
        <input className="input" name="source" placeholder="Instagram, indicação, site..." defaultValue={contact?.source ?? ""} />
      </div>
      <div>
        <label className="label">Tags (separadas por vírgula)</label>
        <input className="input" name="tags" defaultValue={contact?.tags.join(", ")} />
      </div>
      <div>
        <label className="label">Responsável</label>
        <select className="input" name="ownerId" defaultValue={contact?.ownerId ?? ""}>
          <option value="">Ninguém</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
