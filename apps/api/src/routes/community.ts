import { Hono } from 'hono';
import { schemas } from '@hostels/shared';
import { currentUser, requireAuth } from '../lib/auth';
import { body, query } from '../lib/http';
import { toResidency } from '../lib/serialize-community';
import type { AppEnv } from '../lib/types';
import { getHostel, requireBoard } from '../services/community-access';
import * as issues from '../services/community-issues';
import * as posts from '../services/community-posts';
import { claimResidency, myResidencies, residentDirectory } from '../services/community-residents';
import { editReview, myReviews, writeReview } from '../services/community-reviews';

/** Resident routes: residencies, residents list, posts, comments, likes, issues, upvotes, reviews. */
export const communityRoutes = new Hono<AppEnv>();

for (const p of ['/me/residencies', '/me/reviews', '/community/*', '/posts/*', '/issues/*', '/reviews/*']) communityRoutes.use(p, requireAuth);

communityRoutes
  // ---- residencies ----
  .get('/me/residencies', async (c) => c.json(await myResidencies(currentUser(c))))
  .post('/me/residencies', async (c) => {
    const input = await body(c, schemas.claimResidencyInput);
    return c.json(toResidency(await claimResidency(currentUser(c), input)), 201);
  })
  .get('/community/:hostelId/residents', async (c) => {
    const hostel = await getHostel(c.req.param('hostelId'));
    await requireBoard(currentUser(c), hostel);
    return c.json(await residentDirectory(hostel.id));
  })

  // ---- board ----
  .get('/community/:hostelId/posts', async (c) => {
    const page = Number(c.req.query('page') ?? 1) || 1;
    return c.json(await posts.listPosts(currentUser(c), c.req.param('hostelId'), page));
  })
  .post('/community/:hostelId/posts', async (c) => {
    const input = await body(c, schemas.postInput);
    return c.json(await posts.createResidentPost(currentUser(c), c.req.param('hostelId'), input.body), 201);
  })
  .get('/posts/:id', async (c) => c.json(await posts.getPost(currentUser(c), c.req.param('id'))))
  .delete('/posts/:id', async (c) => {
    await posts.deletePost(currentUser(c), c.req.param('id'));
    return c.json({ ok: true as const });
  })
  .post('/posts/:id/comments', async (c) => {
    const input = await body(c, schemas.postCommentInput);
    return c.json(await posts.commentOnPost(currentUser(c), c.req.param('id'), input.body), 201);
  })
  .post('/posts/:id/like', async (c) => c.json(await posts.toggleLike(currentUser(c), c.req.param('id'))))

  // ---- issues ----
  .get('/community/:hostelId/issues', async (c) =>
    c.json(await issues.listBoardIssues(currentUser(c), c.req.param('hostelId'), query(c, schemas.issueListQuery))),
  )
  .post('/community/:hostelId/issues', async (c) => {
    const input = await body(c, schemas.issueInput);
    return c.json(await issues.reportIssue(currentUser(c), c.req.param('hostelId'), input), 201);
  })
  .get('/issues/:id', async (c) => c.json(await issues.getIssue(currentUser(c), c.req.param('id'))))
  .post('/issues/:id/comments', async (c) => {
    const input = await body(c, schemas.issueCommentInput);
    return c.json(await issues.commentOnIssue(currentUser(c), c.req.param('id'), input.body), 201);
  })
  .post('/issues/:id/status', async (c) => {
    const input = await body(c, schemas.issueStatusInput);
    return c.json(await issues.setIssueStatus(currentUser(c), c.req.param('id'), input));
  })
  .post('/issues/:id/upvote', async (c) => c.json(await issues.toggleUpvote(currentUser(c), c.req.param('id'))))

  // ---- reviews ----
  .post('/hostels/:hostelId/reviews', requireAuth, async (c) => {
    const input = await body(c, schemas.reviewInput);
    return c.json(await writeReview(currentUser(c), c.req.param('hostelId'), input), 201);
  })
  .patch('/reviews/:id', async (c) => {
    const input = await body(c, schemas.reviewInput);
    return c.json(await editReview(currentUser(c), c.req.param('id'), input));
  })
  .get('/me/reviews', async (c) => c.json(await myReviews(currentUser(c))));
