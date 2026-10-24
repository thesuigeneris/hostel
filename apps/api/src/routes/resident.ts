import { commentInputSchema, ISSUE_STATUSES, issueInputSchema, issueUpdateSchema, postInputSchema, reasonSchema } from '@hostels/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { parseBody, parseQuery } from '../lib/validate';
import { type AppEnv, requireAuth } from '../middleware/auth';
import { requireMember } from '../services/access';
import {
  addComment,
  createPost,
  deleteComment,
  deletePost,
  feed,
  hostelIssues,
  issueDetail,
  moderateComment,
  moderatePost,
  reportContent,
  reportIssue,
  toggleUpvote,
  updateIssue,
} from '../services/community';
import { residentDirectory } from '../services/residents';

/** Resident-facing: issues and the community board. Membership is checked per hostel in the services. */
export const residentRoutes = new Hono<AppEnv>()
  .use('/hostels/:id/issues', requireAuth())
  .use('/hostels/:id/community', requireAuth())
  .use('/hostels/:id/directory', requireAuth())
  .use('/issues/*', requireAuth())
  .use('/posts/*', requireAuth())
  .use('/comments/*', requireAuth())
  .get('/hostels/:id/issues', async (c) => {
    const { status } = parseQuery(c, z.object({ status: z.enum(ISSUE_STATUSES).optional() }));
    return c.json(await hostelIssues(c.get('user'), c.req.param('id'), status));
  })
  .post('/hostels/:id/issues', async (c) =>
    c.json(await reportIssue(c.get('user'), c.req.param('id'), await parseBody(c, issueInputSchema)), 201),
  )
  .get('/issues/:id', async (c) => c.json(await issueDetail(c.get('user'), c.req.param('id'))))
  .post('/issues/:id/updates', async (c) =>
    c.json(await updateIssue(c.get('user'), c.req.param('id'), await parseBody(c, issueUpdateSchema))),
  )
  .put('/issues/:id/upvote', async (c) => c.json(await toggleUpvote(c.get('user'), c.req.param('id'), true)))
  .delete('/issues/:id/upvote', async (c) => c.json(await toggleUpvote(c.get('user'), c.req.param('id'), false)))

  .get('/hostels/:id/community', async (c) => c.json(await feed(c.get('user'), c.req.param('id'))))
  .post('/hostels/:id/community', async (c) =>
    c.json(await createPost(c.get('user'), c.req.param('id'), await parseBody(c, postInputSchema)), 201),
  )
  .get('/hostels/:id/directory', async (c) => {
    await requireMember(c.get('user'), c.req.param('id'));
    return c.json(await residentDirectory(c.req.param('id')));
  })
  .post('/posts/:id/comments', async (c) => {
    const { body } = await parseBody(c, commentInputSchema);
    return c.json(await addComment(c.get('user'), c.req.param('id'), body), 201);
  })
  .delete('/posts/:id', async (c) => {
    await deletePost(c.get('user'), c.req.param('id'));
    return c.json({ ok: true as const });
  })
  .patch('/posts/:id', async (c) => {
    const patch = await parseBody(c, z.object({ hidden: z.boolean().optional(), pinned: z.boolean().optional() }));
    return c.json(await moderatePost(c.get('user'), c.req.param('id'), patch));
  })
  .post('/posts/:id/report', async (c) => {
    const { reason } = await parseBody(c, reasonSchema);
    return c.json(await reportContent(c.get('user'), 'post', c.req.param('id'), reason));
  })
  .delete('/comments/:id', async (c) => {
    await deleteComment(c.get('user'), c.req.param('id'));
    return c.json({ ok: true as const });
  })
  .patch('/comments/:id', async (c) => {
    const { hidden } = await parseBody(c, z.object({ hidden: z.boolean() }));
    return c.json(await moderateComment(c.get('user'), c.req.param('id'), hidden));
  })
  .post('/comments/:id/report', async (c) => {
    const { reason } = await parseBody(c, reasonSchema);
    return c.json(await reportContent(c.get('user'), 'comment', c.req.param('id'), reason));
  });
