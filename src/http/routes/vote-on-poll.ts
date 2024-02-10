import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { FastifyInstance } from "fastify";
import { redis } from "../../lib/redis";

export async function voteOnPoll(app: FastifyInstance) {
  app.post("/polls/:pollId/votes", async (request, reply) => {
    const voteOnPollBody = z.object({
      pollOptionId: z.string().uuid(),
    });

    const voteOnPollParams = z.object({
      pollId: z.string().uuid(),
    });

    const { pollId } = voteOnPollParams.parse(request.params);
    const { pollOptionId } = voteOnPollBody.parse(request.body);

    let { sessionId } = request.cookies; // Obtenha o sessionId dos cookies de solicitação

    // Verifique se o usuário já votou nesta enquete
    if (sessionId) {
      const userPreviousVoteOnPoll = await prisma.vote.findUnique({
        where: {
          sessionId_pollOptionId: {
            sessionId,
            pollOptionId,
          },
        },
      });

      // Se o usuário já votou nesta enquete, mas em uma opção diferente, exclua o voto anterior
      if (
        userPreviousVoteOnPoll &&
        userPreviousVoteOnPoll.pollOptionId !== pollOptionId
      ) {
        await prisma.vote.delete({
          where: {
            id: userPreviousVoteOnPoll.id,
          },
        });

        await redis.zincrby(pollId, -1, userPreviousVoteOnPoll.pollOptionId);
      }
      // Se o usuário já votou nesta enquete, retorne um erro
      else if (userPreviousVoteOnPoll) {
        return reply
          .status(400)
          .send({ message: "Você já votou nesta enquete" });
      }
    }

    // Se o usuário não tiver um sessionId, crie um novo
    if (!sessionId) {
      sessionId = randomUUID();

      reply.setCookie("sessionId", sessionId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        signed: true,
        httpOnly: true,
      });
    }

    // Crie um novo voto
    await prisma.vote.create({
      data: {
        sessionId,
        pollId,
        pollOptionId,
      },
    });

    await redis.zincrby(pollId, 1, pollOptionId); // Incremente o contador de votos para a opção de enquete (pollOptionId) na enquete (pollId)

    return reply.status(201).send();
  });
}
