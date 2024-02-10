import z, { object } from "zod";
import { prisma } from "../../lib/prisma";
import { FastifyInstance } from "fastify";
import { redis } from "../../lib/redis";

export async function getPoll(app: FastifyInstance) {
  app.post("/polls/:pollId", async (request, reply) => {
    const getPollParams = z.object({
      pollId: z.string().uuid(),
    });

    const { pollId } = getPollParams.parse(request.params);

    const poll = await prisma.poll.findUnique({
      where: {
        id: pollId,
      },
      include: {
        options: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!poll) {
      return reply.status(404).send({ message: "Enquete não encontrada" });
    }

    const result = await redis.zrange(pollId, 0, -1, "WITHSCORES");

    const votes = result.reduce((object, line, index) => {
      if (index % 2 === 0) {
        const score = result[index + 1];

        Object.assign(object, { [line]: Number(score) });
      }

      return object;
    }, {} as Record<string, number>);

    console.log(votes);
    return reply.send({ poll, result });
  });
}
