import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/supabaseServer';
import { getOrCreateAccount } from '../../../../lib/account';
import { deleteTemplate } from '../../../../lib/templates';

// DELETE /api/templates/:id
export async function DELETE(request, { params }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);
    const { id } = await params;
    await deleteTemplate(account.id, id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('templates/[id] DELETE error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
